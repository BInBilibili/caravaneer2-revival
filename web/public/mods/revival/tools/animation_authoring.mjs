// Offline authoring merge and validation. Visual tracks AND clip timing are authorable:
// the AS3 importer only supplies the defaults that an empty authoring source leaves in place.
const transformFields = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'pivotX', 'pivotY', 'alpha'];
// Clip-level fields an authoring patch may replace. The optional ones accept `null` to clear,
// so the runtime falls back to its own default (e.g. drop playbackDuration to play a full death clip).
const timingFields = ['fps', 'duration', 'loop', 'playbackDuration', 'finishOnLastFrame', 'events', 'legacyParts'];
const clearableTimingFields = ['loop', 'playbackDuration', 'finishOnLastFrame', 'events', 'legacyParts'];
const phases = ['idle', 'walk', 'shoot', 'hit', 'death'];
function fail(path, message) { throw new Error(path + ': ' + message); }
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
}
function fields(value, allowed, path) {
  object(value, path);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(path + '.' + key, 'unsupported field');
}
function text(value, path) { if (typeof value !== 'string' || !value.trim()) fail(path, 'expected a non-empty string'); }
function number(value, path) { if (!Number.isFinite(value)) fail(path, 'expected a finite number'); }
function transform(value, path) {
  for (const key of transformFields) if (Object.hasOwn(value, key)) {
    number(value[key], path + '.' + key);
    if (key === 'alpha' && (value[key] < 0 || value[key] > 1)) fail(path + '.alpha', 'must be between 0 and 1');
  }
}
function named(values, key, path) {
  if (!Array.isArray(values)) fail(path, 'expected an array');
  const result = new Map();
  values.forEach((value, index) => {
    const p = path + '[' + index + ']'; object(value, p); text(value[key], p + '.' + key);
    if (result.has(value[key])) fail(p, 'duplicate ' + key + ': ' + value[key]);
    result.set(value[key], value);
  });
  return result;
}
function attachmentReference(name, attachments, path) {
  if (name == null) return;
  text(name, path);
  if (!Object.hasOwn(attachments, name)) fail(path, 'missing attachment: ' + name);
}
function keys(values, duration, path, inspect) {
  if (!Array.isArray(values)) fail(path, 'expected an array');
  const times = new Set();
  values.forEach((key, index) => {
    const p = path + '[' + index + ']'; object(key, p); number(key.time, p + '.time');
    if (key.time < 0 || key.time > duration) fail(p + '.time', 'outside the clip duration');
    if (times.has(key.time)) fail(p + '.time', 'duplicate key time');
    times.add(key.time); inspect(key, p);
  });
}

function clipEvents(events, duration, path) {
  if (!Array.isArray(events)) fail(path, 'expected an array');
  events.forEach((event, index) => {
    const p = path + '[' + index + ']'; fields(event, ['time', 'name', 'value'], p);
    number(event.time, p + '.time');
    if (event.time < 0 || event.time > duration) fail(p + '.time', 'outside the clip duration');
    text(event.name, p + '.name');
  });
}
function clipLegacyParts(parts, path) {
  object(parts, path);
  for (const [part, track] of Object.entries(parts)) {
    const t = path + '.' + part;
    if (!part.trim()) fail(path, 'expected non-empty part names');
    fields(track, ['fps', 'frames'], t);
    if (track.fps !== undefined) {
      number(track.fps, t + '.fps');
      if (!(track.fps > 0)) fail(t + '.fps', 'expected a positive fps');
    }
    if (!Array.isArray(track.frames) || !track.frames.length) fail(t + '.frames', 'expected a non-empty frame array');
    track.frames.forEach((frame, index) => {
      number(frame, t + '.frames[' + index + ']');
      if (!Number.isInteger(frame) || frame < 1) fail(t + '.frames[' + index + ']', 'expected a positive original frame number');
    });
  }
}
/** Mirror the exact requirements the runtime player enforces on a clip, so a bad authored
 * clip fails the build instead of throwing "Invalid action clip timing" during a battle. */
function clipTiming(animation, path) {
  number(animation.fps, path + '.fps');
  if (!(animation.fps > 0)) fail(path + '.fps', 'expected a positive fps');
  number(animation.duration, path + '.duration');
  if (!(animation.duration > 0)) fail(path + '.duration', 'expected a positive duration');
  if (animation.loop !== undefined && typeof animation.loop !== 'boolean') fail(path + '.loop', 'expected a boolean');
  if (animation.finishOnLastFrame !== undefined && typeof animation.finishOnLastFrame !== 'boolean') fail(path + '.finishOnLastFrame', 'expected a boolean');
  if (animation.playbackDuration !== undefined) {
    number(animation.playbackDuration, path + '.playbackDuration');
    if (!(animation.playbackDuration > 0)) fail(path + '.playbackDuration', 'expected a positive duration');
    if (animation.playbackDuration > animation.duration) fail(path + '.playbackDuration', 'must not exceed the clip duration');
  }
  if (animation.events !== undefined) clipEvents(animation.events, animation.duration, path + '.events');
  if (animation.legacyParts !== undefined) clipLegacyParts(animation.legacyParts, path + '.legacyParts');
}
export function validateAuthoredSkeleton(skeleton, { hasImage, hasPart } = {}) {
  const d = skeleton.definition, p = 'definition';
  object(d, p);
  const bones = named(d.bones, 'name', p + '.bones'), slots = named(d.slots, 'name', p + '.slots');
  if (!bones.size) fail(p + '.bones', 'at least one bone is required');
  const attachments = d.attachments ?? {}; object(attachments, p + '.attachments');
  if (d.drawOrder !== undefined && !['legacy', 'slots'].includes(d.drawOrder)) fail(p + '.drawOrder', 'expected legacy or slots');
  const visited = new Set(), visiting = new Set();
  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) fail(p + '.bones.' + name, 'parent cycle');
    const bone = bones.get(name); visiting.add(name);
    fields(bone, ['name', 'parent', ...transformFields], p + '.bones.' + name); transform(bone, p + '.bones.' + name);
    if (bone.parent !== undefined) {
      text(bone.parent, p + '.bones.' + name + '.parent');
      if (!bones.has(bone.parent)) fail(p + '.bones.' + name, 'missing parent: ' + bone.parent);
      visit(bone.parent);
    }
    visiting.delete(name); visited.add(name);
  }
  bones.forEach((_, name) => visit(name));
  for (const [name, attachment] of Object.entries(attachments)) {
    const a = p + '.attachments.' + name;
    fields(attachment, ['image', 'part', 'frame', 'x', 'y', 'muzzle'], a);
    if ((attachment.image !== undefined) === (attachment.part !== undefined)) fail(a, 'specify exactly one image or original part');
    for (const key of ['image', 'part']) if (attachment[key] !== undefined) text(attachment[key], a + '.' + key);
    if (attachment.frame !== undefined && (!Number.isInteger(attachment.frame) || attachment.frame < 1)) fail(a + '.frame', 'expected a positive original frame number');
    for (const key of ['x', 'y']) if (attachment[key] !== undefined) number(attachment[key], a + '.' + key);
    if (attachment.muzzle !== undefined) {
      fields(attachment.muzzle, ['x', 'y'], a + '.muzzle');
      number(attachment.muzzle.x, a + '.muzzle.x'); number(attachment.muzzle.y, a + '.muzzle.y');
    }
    if (attachment.image && hasImage && !hasImage(attachment.image)) fail(a + '.image', 'image is not registered or file is missing: ' + attachment.image);
    // Generated original slots may be intentionally empty (e.g. ShoulderPlates).
    if (!name.startsWith('original:') && attachment.part && hasPart && !hasPart(attachment.part, attachment.frame)) fail(a + '.part', 'unknown original part/frame');
  }
  for (const [name, slot] of slots) {
    const s = p + '.slots.' + name;
    fields(slot, ['name', 'bone', 'part', 'z', 'attachment', 'visible', 'directions', ...transformFields], s);
    if (!bones.has(slot.bone)) fail(s + '.bone', 'missing bone: ' + slot.bone);
    text(slot.part, s + '.part'); transform(slot, s);
    if (slot.z !== undefined) number(slot.z, s + '.z');
    if (slot.visible !== undefined && typeof slot.visible !== 'boolean') fail(s + '.visible', 'expected a boolean');
    attachmentReference(slot.attachment, attachments, s + '.attachment');
    if (slot.directions !== undefined) {
      object(slot.directions, s + '.directions');
      for (const [direction, value] of Object.entries(slot.directions)) {
        if (!['0', '1', '2', '3'].includes(direction)) fail(s + '.directions', 'expected original direction 0..3');
        fields(value, ['z', ...transformFields], s + '.directions.' + direction); transform(value, s + '.directions.' + direction);
        if (value.z !== undefined) number(value.z, s + '.directions.' + direction + '.z');
      }
    }
  }
  for (const [name, clip] of Object.entries(skeleton.animations)) {
    const c = 'animations.' + name;
    clipTiming(clip, c);
    const boneTracks = named(clip.tracks, 'bone', c + '.tracks');
    const slotTracks = named(clip.slotTracks ?? [], 'slot', c + '.slotTracks');
    for (const [bone, track] of boneTracks) {
      const t = c + '.tracks.' + bone; fields(track, ['bone', 'keys'], t);
      if (!bones.has(bone)) fail(t, 'missing bone');
      keys(track.keys, clip.duration, t + '.keys', (key, path) => {
        fields(key, ['time', 'transform', 'interpolation'], path);
        fields(key.transform, transformFields, path + '.transform'); transform(key.transform, path + '.transform');
        if (key.interpolation !== undefined && !['linear', 'step'].includes(key.interpolation)) fail(path + '.interpolation', 'expected linear or step');
      });
    }
    for (const [slot, track] of slotTracks) {
      const t = c + '.slotTracks.' + slot; fields(track, ['slot', 'keys'], t);
      if (!slots.has(slot)) fail(t, 'missing slot');
      keys(track.keys, clip.duration, t + '.keys', (key, path) => {
        fields(key, ['time', 'attachment', 'visible', 'z'], path);
        attachmentReference(key.attachment, attachments, path + '.attachment');
        if (key.visible !== undefined && typeof key.visible !== 'boolean') fail(path + '.visible', 'expected a boolean');
        if (key.z !== undefined) number(key.z, path + '.z');
      });
    }
  }
}

/** The input must be a freshly regenerated original skeleton, not prior output.
 * Visual tracks AND clip timing (fps, duration, loop, playbackDuration, finishOnLastFrame,
 * events, legacyParts) are authorable; an empty authoring source still reproduces the original
 * output exactly. Optional timing fields accept `null` to clear back to the runtime default.
 * No mutation of either input: a validation error cannot half-apply author edits. */
export function applyAnimationAuthoring(original, authoring, options) {
  fields(authoring, ['version', 'definition', 'animations'], 'authoring');
  if (authoring.version !== 1) fail('authoring.version', 'expected 1');
  const definition = authoring.definition ?? {}, animations = authoring.animations ?? {};
  fields(definition, ['bones', 'slots', 'attachments', 'drawOrder'], 'authoring.definition');
  object(animations, 'authoring.animations');
  const result = structuredClone(original);
  for (const key of ['bones', 'slots', 'drawOrder']) if (Object.hasOwn(definition, key)) result.definition[key] = structuredClone(definition[key]);
  if (definition.attachments !== undefined) {
    object(definition.attachments, 'authoring.definition.attachments');
    for (const [name, attachment] of Object.entries(definition.attachments)) {
      if (name.startsWith('original:') || ['__proto__', 'constructor', 'prototype'].includes(name)) fail('authoring.definition.attachments.' + name, 'reserved attachment name');
      result.definition.attachments[name] = structuredClone(attachment);
    }
  }
  for (const [name, patch] of Object.entries(animations)) {
    if (!/^(idle|walk|shoot|hit|death)_[0-7]$/.test(name) || !Object.hasOwn(result.animations, name)) fail('authoring.animations.' + name, 'expected one of the 40 original clip names, e.g. walk_0');
    fields(patch, ['tracks', 'slotTracks', ...timingFields], 'authoring.animations.' + name);
    for (const key of ['tracks', 'slotTracks']) if (Object.hasOwn(patch, key)) result.animations[name][key] = structuredClone(patch[key]);
    // Clip timing is authorable too: an authored value replaces the importer default, and an
    // explicit `null` clears an optional one so the runtime falls back on its own default.
    for (const key of timingFields) {
      if (!Object.hasOwn(patch, key)) continue;
      const path = 'authoring.animations.' + name + '.' + key;
      if (patch[key] === null) {
        if (!clearableTimingFields.includes(key)) fail(path, 'cannot be cleared');
        delete result.animations[name][key];
      } else result.animations[name][key] = structuredClone(patch[key]);
    }
  }
  // Unsuffixed aliases must preview exactly the same authored type-0 visual.
  for (const phase of phases) result.animations[phase] = { ...structuredClone(result.animations[phase + '_0']), name: phase };
  validateAuthoredSkeleton(result, options);
  return result;
}
