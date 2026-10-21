import {validCoordinates} from './location';

// Only validated numeric coordinates enter this document. No addresses or user HTML.
export function mapDocument(value) {
  const selected = validCoordinates(value);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: https://tile.openstreetmap.org; connect-src 'none'">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>html,body,#map{height:100%;margin:0}#status{position:absolute;top:8px;left:50px;right:8px;z-index:1000;background:white;padding:6px;font:13px sans-serif}.pin{font-size:30px;color:#b42318;text-shadow:0 1px 3px white}</style></head>
<body><div id="map"></div><div id="status">Loading map. If unavailable, enter coordinates in the form.</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
<script>
if(window.L){
 const initial=${JSON.stringify(selected)}, map=L.map('map').setView(initial?[initial.latitude,initial.longitude]:[-29,24],initial?15:5);
 const status=document.getElementById('status');status.textContent='Tap the map or drag the pin to select. Zoom in to check the position.';
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:0,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}).addTo(map).on('tileerror',()=>{status.textContent='Map tiles unavailable. Try again or enter coordinates in the form.'});
 let marker=null;
 function place(point,notify){
  const p=point.wrap();
  if(!marker){marker=L.marker(p,{draggable:true,icon:L.divIcon({className:'pin',html:'&#128205;',iconSize:[30,30],iconAnchor:[15,30]})}).addTo(map);marker.on('dragend',()=>place(marker.getLatLng(),true))}else marker.setLatLng(p);
  if(notify){const message=JSON.stringify({type:'pmr-location',latitude:p.lat,longitude:p.lng});if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(message);else window.parent.postMessage(message,'*')}
 }
 if(initial)place(L.latLng(initial.latitude,initial.longitude),false);
 map.on('click',event=>place(event.latlng,true));
}
</script></body></html>`;
}
