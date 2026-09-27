import fs from 'node:fs';
import path from 'node:path';
import { transformWithEsbuild, normalizePath } from 'vite';

const registry = 'virtual:bundled-mod-runtimes';
const qaPrefix = 'virtual:bundled-mod-qa/';
const prefix = '\0bundled-mod:';

/** Only explicitly shipped packages are executable without third-party script opt-in.
 * Their source stays in the mod folder; shared imports resolve to the SAME host modules.
 * Public .ts files are never directly executed by a browser.
 */
export function bundledModRuntimePlugin(bundledFolders = []) {
  let root, command, packages = [];
  const inside = (file, directory) => file.startsWith(directory + '/');
  const asSource = file => {
    for (const candidate of [file, file + '.ts', file + '.js', file + '/index.ts']) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return normalizePath(candidate);
    }
    throw new Error('Missing bundled mod source: ' + file);
  };
  return {
    name: 'bundled-mod-runtime', enforce: 'pre',
    configResolved(config) {
      root = config.root; command = config.command;
      packages = bundledFolders.flatMap(folder => {
        const directory = normalizePath(path.resolve(config.publicDir, 'mods', folder));
        const manifestPath = path.join(directory, 'manifest.json');
        if (!fs.existsSync(manifestPath)) return []; // Removing an optional DLC must not break the build.
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (!manifest.runtime) return [];
        const entry = asSource(path.resolve(directory, manifest.runtime));
        if (!inside(entry, directory)) throw new Error('Bundled runtime escapes its package');
        return [{ id: manifest.id, folder, manifestUrl: `mods/${folder}/manifest.json`, directory, entry }];
      });
    },
    async resolveId(source, importer) {
      if (source === registry) return '\0' + registry;
      if (source.startsWith(qaPrefix) && command === 'serve') {
        const [folder, ...parts] = source.slice(qaPrefix.length).split('/');
        const pkg = packages.find(candidate => candidate.folder === folder);
        if (!pkg) throw new Error('Unknown bundled mod QA package: ' + folder);
        const directory = normalizePath(path.resolve(pkg.directory, 'qa'));
        const file = asSource(path.resolve(directory, parts.join('/')));
        if (!inside(file, directory)) throw new Error('QA entry escapes its package');
        return prefix + file;
      }
      if (source.startsWith(prefix)) {
        const file = normalizePath(path.resolve(source.slice(prefix.length)));
        if (!packages.some(pkg => inside(file, pkg.directory))) throw new Error('Runtime entry escapes bundled packages');
        return prefix + file;
      }
      if (importer?.startsWith(prefix) && source.startsWith('.')) {
        const file = asSource(path.resolve(path.dirname(importer.slice(prefix.length)), source));
        if (packages.some(pkg => inside(file, pkg.directory))) return prefix + file;
        if (!inside(file, normalizePath(path.resolve(root, 'src')))) throw new Error('Unsupported bundled mod import: ' + file);
        return this.resolve(file, undefined, { skipSelf: true });
      }
    },
    async load(id) {
      if (id === '\0' + registry) return 'export default [' + packages.map(pkg =>
        `{id:${JSON.stringify(pkg.id)},manifestUrl:${JSON.stringify(pkg.manifestUrl)},load:()=>import(${JSON.stringify(prefix + pkg.entry)})}`
      ).join(',') + '];';
      if (!id.startsWith(prefix)) return;
      const file = id.slice(prefix.length);
      this.addWatchFile(file);
      return transformWithEsbuild(fs.readFileSync(file, 'utf8'), file, { loader: 'ts', target: 'es2022', sourcemap: true });
    },
  };
}
