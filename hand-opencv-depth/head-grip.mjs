// Contact preserves tracked joint angles, connected bases and fixed model dimensions.
export function fitHeadGrip(points,chains,lengths,hinges,contacts,strength=1){
 const contact=contacts.find(c=>c?.source&&c?.target);if(!contact)return;
 const delta=contact.target.clone().sub(contact.source).multiplyScalar(Math.max(0,Math.min(1,strength)));
 points[0].add(delta);for(const chain of chains)for(const point of chain)point.add(delta);
}
