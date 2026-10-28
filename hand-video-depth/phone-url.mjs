// A loopback receiver must never send the phone to its own localhost.
// The public HTTPS sender can call the local receiver through the pairing ID.
export function phoneCameraURL(moduleURL,id,quality='720'){
 const url=new URL('video-camera.html',moduleURL);
 if(['127.0.0.1','localhost','[::1]'].includes(url.hostname)){
  url.href='https://dominicdamire.github.io/rps-hand/hand-video-depth/video-camera.html';
 }
 url.searchParams.set('pair',id);
 url.searchParams.set('quality',['480','720','1080'].includes(quality)?quality:'720');
 url.searchParams.set('v','phone3');
 return url;
}
