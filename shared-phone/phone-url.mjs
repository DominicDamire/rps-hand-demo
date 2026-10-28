// Phones cannot reach a desktop loopback URL. Use the public HTTPS sender.
export function phoneCameraURL(moduleURL,id,quality='720') {
 const url=new URL('../hand-pnp-photo/video-camera.html',moduleURL);
 if(url.protocol==='file:' || ['127.0.0.1','localhost','[::1]'].includes(url.hostname))
  url.href='https://dominicdamire.github.io/rps-hand/hand-pnp-photo/video-camera.html';
 url.searchParams.set('pair',id);
 url.searchParams.set('quality',['480','720','1080'].includes(quality)?quality:'720');
 url.searchParams.set('v','shared-phone1');
 return url;
}
