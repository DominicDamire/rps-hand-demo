export function phoneConnectionError(error){
 const type=error?.type||error?.name||'unknown';
 const messages={
  'peer-unavailable':'The PC pairing ID is unavailable. Keep the receiver page open and scan its current QR again. An older QR stops working after reconnecting or refreshing the PC page.',
  network:'The phone lost contact with the pairing server. Check its internet connection, then retry.',
  'server-error':'The pairing server returned an error. Retry the connection.',
  'socket-error':'The phone could not connect to the pairing server. Check internet access or whether this network blocks WebSockets.',
  'socket-closed':'The pairing-server connection closed. Retry the connection.',
  'browser-incompatible':'This browser does not support the required video connection. Open this HTTPS page in Safari or Chrome instead of an embedded QR-scanner browser.',
  webrtc:'Video negotiation failed. Try both devices on the same Wi-Fi; this network may require a working TURN relay.',
  NotAllowedError:'Camera access was denied. Allow camera access for this page in the phone browser.',
  NotFoundError:'No camera was available on this device.',
  NotReadableError:'The camera could not start. Close another app using the camera, then retry.'
 };
 return (messages[type]||error?.message||'Phone connection failed.')+' ['+type+']';
}
