// node tools/merge-hero.mjs <rigged.glb> <out.glb> name=clip.glb [name=clip.glb ...]
// Copies the first animation of each clip GLB into the rigged GLB under `name`, matching target nodes by name.
// The rig's own placeholder animation is dropped; unused data is pruned.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';

const [riggedPath, outPath, ...pairs] = process.argv.slice(2);
if (!outPath || !pairs.length) { console.error('usage: merge-hero.mjs <rigged.glb> <out.glb> name=clip.glb ...'); process.exit(1); }
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(riggedPath);
const root = doc.getRoot();
const buffer = root.listBuffers()[0] || doc.createBuffer();
const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
for (const a of root.listAnimations()) a.dispose();

for (const pair of pairs) {
  const [name, file] = pair.split('=');
  const src = (await io.read(file)).getRoot().listAnimations()[0];
  if (!src) throw new Error(`no animation in ${file}`);
  const anim = doc.createAnimation(name);
  let n = 0;
  for (const ch of src.listChannels()) {
    const target = byName.get(ch.getTargetNode()?.getName());
    if (!target) continue;
    const s = ch.getSampler();
    const input = doc.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buffer);
    const output = doc.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation(s.getInterpolation());
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    n++;
  }
  if (!n) throw new Error(`${name}: no channel matched a node of the rig`);
  console.error(`${name}: ${n} channels`);
}
await doc.transform(dedup(), prune());
await io.write(outPath, doc);
