declare module "virtual:bundled-mod-runtimes" {
  const runtimes: import("./core/ModRuntime").BundledModRuntime[];
  export default runtimes;
}
