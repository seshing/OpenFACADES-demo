'use strict';
const $ = id => document.getElementById(id);
const emptyCollection = () => ({type:'FeatureCollection',features:[]});
const COLORS = ['#77decc','#f7b889','#b6a1e5','#80bbed','#e9a4c7'];
let data, globe, cityMap, city, pano, building, detected = false;
let globeMarkers=[], pointMarkers=[], buildingMarkers=[], cityRequest=0;
let cityMapReady;
let mapAttribute='';
let globePauseUntil=0,globeReady=false;
const TYPE_COLORS={Residential:'#72bfa9',Commercial:'#daa471',Office:'#82a8d6',Public:'#a397d0',Industrial:'#a8b478',Unknown:'#8c97a1'};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function makeMap(container,options){const map = new maplibregl.Map({container,style:'map-style.json?v=13',attributionControl:{compact:true},...options});map.addControl(new maplibregl.NavigationControl({showCompass:false}), container==='city-map'?'bottom-left':'bottom-right');map.on('error',()=>{if(!document.querySelector(`#${container} .map-fallback`)){const note=document.createElement('div');note.className='map-fallback';note.textContent='Basemap unavailable. Sample locations remain interactive.';$(container).append(note);}});return map;}
function showWorld(){cityRequest++;$('inspector').hidden=true;$('sightline-pulses').replaceChildren();$('world-view').hidden=false;$('city-view').hidden=true;city=null;pano=null;building=null;detected=false;history.replaceState(null,'',location.pathname);globe?.resize();}
async function selectCity(id){const selected=data.cities.find(c=>c.id===id);if(!selected)throw Error('Unknown city');const request=++cityRequest;city=selected;mapAttribute='';$('distribution-label').textContent='Map view';$('distribution-picker').open=false;$('distribution-picker').hidden=!city.panoramas.length;document.querySelectorAll('[data-attribute]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.attribute==='')));$('type-legend').hidden=true;pano=null;building=null;detected=false;$('world-view').hidden=true;$('city-view').hidden=false;$('sightline-pulses').replaceChildren();$('city-title').textContent=city.name;$('inspector').hidden=true;$('city-notice').hidden=city.panoramas.length>0;$('city-list').hidden=true;$('choose-city').setAttribute('aria-expanded','false');
history.replaceState(null,'',`#${city.id}`);
resetPanorama();if(!cityMap){cityMap=makeMap('city-map',{center:[(city.bbox[0]+city.bbox[2])/2,(city.bbox[1]+city.bbox[3])/2],zoom:16});cityMapReady=new Promise(resolve=>cityMap.once('load',resolve));await cityMapReady;cityMap.addSource('footprints',{type:'geojson',data:emptyCollection()});cityMap.addLayer({id:'footprints-fill',type:'fill',source:'footprints',paint:{'fill-color':['case',['==',['get','selected'],true],'#77decc','#3d5665'],'fill-opacity':['case',['==',['get','selected'],true],.65,.32]}});cityMap.addLayer({id:'footprints-line',type:'line',source:'footprints',paint:{'line-color':'#668292','line-width':1}});cityMap.on('move',updatePulses);cityMap.addSource('sightlines',{type:'geojson',data:emptyCollection()});cityMap.addLayer({id:'sightlines',type:'line',source:'sightlines',paint:{'line-color':['get','color'],'line-width':1,'line-opacity':0}});cityMap.on('click','footprints-fill',event=>{const id=event.features?.[0]?.properties.building_id;openMappedBuilding(String(id));});cityMap.on('mouseenter','footprints-fill',()=>cityMap.getCanvas().style.cursor='pointer');cityMap.on('mouseleave','footprints-fill',()=>cityMap.getCanvas().style.cursor='');}
await cityMapReady;if(request!==cityRequest)return;cityMap.resize();cityMap.fitBounds([[city.bbox[0],city.bbox[1]],[city.bbox[2],city.bbox[3]]],{padding:35,duration:600});pointMarkers.forEach(m=>m.remove());pointMarkers=city.panoramas.map((p,i)=>{const btn=document.createElement('button');btn.className='view-marker';btn.setAttribute('aria-label','Open street view');btn.dataset.pid=p.id;btn.onclick=()=>selectPanorama(p.id);return new maplibregl.Marker({element:btn}).setLngLat(p.location).addTo(cityMap);});cityMap.getSource('sightlines').setData(emptyCollection());$('sightline-pulses').replaceChildren();clearBuildingMarkers();let footprints=emptyCollection();if(city.footprints){try{const response=await fetch(city.footprints);if(!response.ok)throw Error('Footprints could not be loaded');footprints=await response.json();}catch(error){console.warn(error.message);}}if(request!==cityRequest)return;city._footprints=footprints;setSelectedFootprint();renderTypeMap();}

function resetPanorama(){$('panorama-view').hidden=false;$('return-panorama').hidden=true;$('panorama-wrap').replaceChildren();$('image-credit').replaceChildren();$('detect').disabled=true;$('detect').textContent='Detect buildings';$('building-panel').hidden=true;$('building-panel').replaceChildren();}
function focusStreetView(duration=400){
  if(!pano)return;
  const portrait=matchMedia('(max-width:700px) and (orientation:portrait)').matches;
  const padding=portrait
    ? {left:24,right:24,top:90,bottom:Math.max($('inspector').offsetHeight,innerHeight/2)+80}
    : {left:24,right:$('inspector').offsetWidth+48,top:90,bottom:48};
  const bounds=new maplibregl.LngLatBounds();
  for(const point of [pano.location,...pano.buildings.map(b=>b.location)])bounds.extend(point);
  const camera=cityMap.cameraForBounds(bounds,{padding,maxZoom:18});
  cityMap.easeTo({...camera,padding:{left:0,right:0,top:0,bottom:0},duration});
}
function openInspector(){
  $('inspector').hidden=false;$('inspector').scrollTop=0;
}
function closeInspector(){
  $('inspector').hidden=true;
}
window.addEventListener('resize',()=>{if(!$('inspector').hidden)focusStreetView(0);});
function selectPanorama(id){const selected=city.panoramas.find(p=>p.id===id);if(!selected)throw Error('Unknown street view');pano=selected;building=null;detected=false;resetPanorama();$('panorama-title').textContent='Street view';openInspector();$('panorama-wrap').innerHTML=`<img src="${escapeHtml(pano.image)}" alt="Original Mapillary panorama in ${escapeHtml(city.name)}" width="2048" height="1024">`;$('image-credit').innerHTML=`<span>© ${escapeHtml(pano.creator)} / Mapillary · ${escapeHtml(pano.capturedAt)}</span><a href="${escapeHtml(pano.sourceUrl)}" target="_blank" rel="noopener">View source ↗</a>`;$('detect').disabled=pano.status!=='ready'||!pano.buildings.length;document.querySelectorAll('[data-pid]').forEach(el=>{el.classList.toggle('active',el.dataset.pid===pano.id);el.classList.toggle('selected',el.dataset.pid===pano.id);});cityMap.getSource('sightlines').setData(emptyCollection());$('sightline-pulses').replaceChildren();clearBuildingMarkers();setSelectedFootprint();focusStreetView();}
function clearBuildingMarkers(){buildingMarkers.forEach(m=>m.remove());buildingMarkers=[];}
function revealDetections(){if(!pano||pano.status!=='ready'||!pano.buildings.length)return;detected=true;$('detect').textContent='Original';renderBoxes();renderLines();clearBuildingMarkers();buildingMarkers=pano.buildings.map((b,i)=>{const btn=document.createElement('button');btn.className='building-marker';btn.textContent=i+1;btn.title=`Building ${i+1}`;btn.dataset.bid=b.id;btn.setAttribute('aria-label',`Select building ${i+1}`);btn.onclick=()=>selectBuilding(b.id);return new maplibregl.Marker({element:btn}).setLngLat(b.location).addTo(cityMap);});$('building-panel').hidden=true;}

function renderBoxes(){document.querySelectorAll('.detection-box').forEach(el=>el.remove());if(!detected)return;pano.buildings.forEach((b,i)=>{const [cx,cy,w,h]=b.box;let left=cx-w/2;const top=100*(cy-h/2);const pieces=[];if(left<0){pieces.push([0,left+w],[1+left,-left]);}else if(left+w>1){pieces.push([left,1-left],[0,left+w-1]);}else{pieces.push([left,w]);}pieces.forEach(([x,width])=>{if(width<=0)return;const btn=document.createElement('button');btn.className=`detection-box${building?.id===b.id?' selected':''}`;btn.style.cssText=`left:${x*100}%;top:${top}%;width:${width*100}%;height:${h*100}%`;btn.setAttribute('aria-label',`Select building ${i+1}, ${Math.round(b.box[4]*100)} percent detection confidence`);btn.innerHTML=`<span class="box-tag">${i+1}</span>`;btn.onclick=()=>selectBuilding(b.id);$('panorama-wrap').append(btn);});});}
function renderLines(){const lines=pano.buildings.map((b,i)=>({type:'Feature',properties:{color:'#77decc'},geometry:{type:'LineString',coordinates:[pano.location,b.location]}}));cityMap.getSource('sightlines').setData({type:'FeatureCollection',features:lines});renderPulses();}
function renderPulses(){
  $('sightline-pulses').innerHTML=pano.buildings.map((b,i)=>`<g data-target="${escapeHtml(b.id)}">
    <defs><linearGradient id="line-light-${i}" gradientUnits="userSpaceOnUse" spreadMethod="pad">
      <stop offset="0" stop-color="#9cdbc9" stop-opacity="0"/>
      <stop offset=".3" stop-color="#9cdbc9" stop-opacity="0"/>
      <stop offset=".5" stop-color="#9cdbc9" stop-opacity=".65"/>
      <stop offset=".7" stop-color="#9cdbc9" stop-opacity="0"/>
      <stop offset="1" stop-color="#9cdbc9" stop-opacity="0"/>
      <animateTransform attributeName="gradientTransform" type="translate" dur="4s" repeatCount="indefinite"/>
    </linearGradient></defs>
    <path class="line-base"/><path class="line-glow" stroke="url(#line-light-${i})"/><path class="line-shine" stroke="url(#line-light-${i})"/>
  </g>`).join('');
  updatePulses();
}
function updatePulses(){
  if(!detected||!pano)return;
  const start=cityMap.project(pano.location);
  for(const line of $('sightline-pulses').children){
    const target=pano.buildings.find(b=>b.id===line.dataset.target);
    if(!target)continue;
    const center=cityMap.project(target.location);
    const dx=center.x-start.x,dy=center.y-start.y;
    const length=Math.hypot(dx,dy);
    if(!length)continue;
    const marker=document.querySelector(`[data-bid="${target.id}"]`);
    const half=(marker?.offsetWidth||26)/2;
    const inset=Math.min(length,half/Math.max(Math.abs(dx/length),Math.abs(dy/length)));
    const end={x:center.x-dx/length*inset,y:center.y-dy/length*inset};
    const path=`M${start.x},${start.y} L${end.x},${end.y}`;
    for(const stroke of line.querySelectorAll('path'))stroke.setAttribute('d',path);
    const gradient=line.querySelector('linearGradient');
    gradient.setAttribute('x1',start.x);gradient.setAttribute('y1',start.y);
    gradient.setAttribute('x2',end.x);gradient.setAttribute('y2',end.y);
    const motion=gradient.querySelector('animateTransform');
    motion.setAttribute('from',`${start.x-end.x} ${start.y-end.y}`);
    motion.setAttribute('to',`${end.x-start.x} ${end.y-start.y}`);
  }
}
function attributeValue(attributes,field){
  if(field==='materialFirst')return attributes?.material?.first;
  if(field==='materialSecondary')return attributes?.material?.secondary;
  if(field==='floors'){
    const floors=Number(attributes?.floors);
    if(floors>10)return '11+';
    if(floors>5)return '6–10';
  }
  return attributes?.[field];
}
function observationDistance(from,to){
  const radians=Math.PI/180;
  const lat=(to[1]-from[1])*radians,lon=(to[0]-from[0])*radians;
  const a=Math.sin(lat/2)**2+Math.cos(from[1]*radians)*Math.cos(to[1]*radians)*Math.sin(lon/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,a)));
}
function inferredBuildings(){
  const groups=new Map(),records=new Map();
  for(const p of city.panoramas)for(const b of p.buildings){
    if(!b.attributes)continue;
    const observations=groups.get(b.id)||[];
    observations.push({building:b,distance:observationDistance(p.location,b.location)});
    groups.set(b.id,observations);
  }
  for(const [id,observations] of groups){
    observations.sort((a,b)=>a.distance-b.distance);
    const attributes={...observations[0].building.attributes,material:{}};
    // Vote separately for each attribute; a tie uses the closest observation.
    for(const field of ['type','mixUsed','age','floors','materialFirst','materialSecondary']){
      const votes=new Map();
      for(const observation of observations){
        const value=attributeValue(observation.building.attributes,field);
        if(!value)continue;
        const vote=votes.get(value)||{value,count:0,distance:observation.distance};
        vote.count++;votes.set(value,vote);
      }
      const winner=[...votes.values()].sort((a,b)=>b.count-a.count||a.distance-b.distance)[0]?.value;
      if(field==='materialFirst')attributes.material.first=winner;
      else if(field==='materialSecondary')attributes.material.secondary=winner;
      else attributes[field]=winner;
    }
    records.set(id,{...observations[0].building,attributes});
  }
  return records;
}
function setSelectedFootprint(){
  if(!cityMap?.getSource('footprints'))return;
  const source=city?._footprints||emptyCollection();
  const inferred=city?inferredBuildings():new Map();
  cityMap.getSource('footprints').setData({...source,features:source.features.map(f=>{
    const id=String(f.properties.building_id);
    return {...f,properties:{...f.properties,selected:building?.id===id,inferredClass:attributeValue(inferred.get(id)?.attributes,mapAttribute)||'Not inferred'}};
  })});
}
function categoryColors(){
  if(mapAttribute==='type')return TYPE_COLORS;
  const field=mapAttribute==='materialFirst'?'material':mapAttribute==='materialSecondary'?'secondary':mapAttribute;
  const palette=mapAttribute==='age'?['#627b9d','#6e8eb0','#79a1bf','#83b7c1','#89c3b1','#abc790','#c6c87f','#d3b582','#ce9f89','#c892a6','#b8a1ca','#a1b0d8']:['#72bfa9','#daa471','#82a8d6','#a397d0','#cc8f9f','#a8b478','#78b9bf','#bca087','#afaabf','#8c97a1','#71818d'];
  return Object.fromEntries(data.taxonomy[field].map((value,i)=>[value,palette[i%palette.length]]));
}
function renderTypeMap(){
  if(!cityMap?.getLayer('footprints-fill'))return;
  $('type-legend').hidden=!mapAttribute;
  if(!mapAttribute){
    cityMap.setPaintProperty('footprints-fill','fill-color',['case',['==',['get','selected'],true],'#77decc','#3d5665']);
    cityMap.setPaintProperty('footprints-fill','fill-opacity',['case',['==',['get','selected'],true],.65,.32]);
    return;
  }
  const colors=categoryColors();
  cityMap.setPaintProperty('footprints-fill','fill-color',['match',['get','inferredClass'],...Object.entries(colors).flat(),'#3d5665']);
  cityMap.setPaintProperty('footprints-fill','fill-opacity',['case',['==',['get','inferredClass'],'Not inferred'],.15,.7]);
  const records=inferredBuildings(),counts={};
  for(const b of records.values()){const kind=attributeValue(b.attributes,mapAttribute);if(kind)counts[kind]=(counts[kind]||0)+1;}
  $('type-legend').innerHTML=Object.entries(colors).filter(([kind])=>counts[kind]).map(([kind,color])=>`<div><i style="background:${color}"></i><span>${escapeHtml(kind)}</span><span>${counts[kind]}</span></div>`).join('')+`<div><i style="background:#3d5665"></i><span>Not inferred</span></div><p>${Object.values(counts).reduce((a,b)=>a+b,0)} buildings${mapAttribute==='age'?' · Estimated':''}</p>`;
}
function openMappedBuilding(id){
  if(mapAttribute){
    const view=city.panoramas.find(p=>p.buildings.some(b=>b.id===id));
    if(!view)return;
    if(!pano?.buildings.some(b=>b.id===id))selectPanorama(view.id);
    if(!detected)revealDetections();
    selectBuilding(id);
  }else if(detected&&pano?.buildings.some(b=>b.id===id))selectBuilding(id);
}
function selectBuilding(id){if(!detected)throw Error('Reveal detections first');const selected=pano.buildings.find(b=>b.id===id);if(!selected)throw Error('Unknown building');building=selected;openInspector();$('building-panel').hidden=false;const index=pano.buildings.indexOf(building)+1;$('panorama-view').hidden=true;$('return-panorama').hidden=false;$('panorama-title').textContent=`id ${building.id} (${building.source||'unknown'})`;const a=building.attributes||{};const attribute=(label,value)=>`<div><dt>${label}</dt><dd>${escapeHtml(value||'Unknown')}</dd></div>`;$('building-panel').innerHTML=`<div class="building-content"><div class="building-image"><img src="${escapeHtml(building.image)}" alt="Perspective projection of building ${index} in ${escapeHtml(city.name)}"></div><div class="building-attributes"><dl class="attribute-grid">${attribute('Building type',a.type)}${attribute('Mix-used',a.mixUsed)}${attribute('Facade material · First',a.material?.first)}${attribute('Facade material · Secondary',a.material?.secondary)}${attribute('Floors · Estimated',a.floors)}${attribute('Building age · Estimated',a.age)}</dl><p class="caption">${escapeHtml(a.caption||'Visual description is being prepared.')}</p></div></div><div class="inference-note">Visually inferred · ${Math.round(building.box[4]*100)}% detection confidence</div>`;document.querySelectorAll('[data-bid]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.bid===id));renderBoxes();renderLines();setSelectedFootprint();}
async function start(){const response=await fetch('data.json',{cache:'no-store'});if(!response.ok)throw Error('Sample data could not be loaded');data=await response.json();for(const c of data.cities)c.panoramas=c.panoramas.filter(p=>p.status==='ready'&&p.buildings.length);$('city-list').replaceChildren();data.cities.forEach((c,i)=>{const btn=document.createElement('button');btn.className='city-button';btn.innerHTML=`<span><span class="city-name">${escapeHtml(c.name)}</span></span><span class="arrow">↗</span>`;btn.onclick=()=>selectCity(c.id).catch(showError);$('city-list').append(btn);});globe=makeMap('globe',{center:[-20,28],zoom:Math.log2(Math.min(innerWidth,innerHeight)/220),minZoom:.2,maxZoom:4.5});
globe.on('style.load',()=>{
  globe.setProjection({type:'globe'});
  globe.setPaintProperty('background','background-color','#484848');
  globe.setPaintProperty('water','fill-color','#202020');
  globe.setLight({anchor:'viewport',position:[1.15,135,150]});
  for(const layer of ['place_country_other','place_country_minor','place_country_major']){
    globe.setLayoutProperty(layer,'text-size',9);globe.setPaintProperty(layer,'text-color','#898989');globe.setPaintProperty(layer,'text-halo-width',0);globe.setFilter(layer,['all',globe.getFilter(layer),['!=',['get','iso_a2'],'TW'],['!=',['coalesce',['get','name_en'],['get','name:latin'],['get','name'],''],'Taiwan']]);globe.setPaintProperty(layer,'text-opacity',.65);
  }
  globe.setSky({'sky-color':'#080808','horizon-color':'#777777','fog-color':'#202020','sky-horizon-blend':.15,'horizon-fog-blend':0,'fog-ground-blend':0,'atmosphere-blend':['interpolate',['linear'],['zoom'],0,.03,3,.015,5,0]});
});
globe.once('load',()=>{
  globeReady=true;
  const cities={type:'FeatureCollection',features:data.cities.map(c=>({type:'Feature',properties:{id:c.id,name:c.name,labelLeft:['amsterdam','helsinki','houston'].includes(c.id)},geometry:{type:'Point',coordinates:[(c.bbox[0]+c.bbox[2])/2,(c.bbox[1]+c.bbox[3])/2]}}))};
  globe.addSource('cities',{type:'geojson',data:cities});
  globe.addLayer({id:'city-glow',type:'circle',source:'cities',paint:{'circle-radius':18,'circle-color':'#77decc','circle-opacity':.15,'circle-blur':.5,'circle-pitch-alignment':'map'}});
  globe.addLayer({id:'city-points',type:'circle',source:'cities',paint:{'circle-radius':5,'circle-color':'#77decc','circle-stroke-width':0,'circle-pitch-alignment':'map'}});
  globe.addLayer({id:'city-labels',type:'symbol',source:'cities',layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':['case',['get','labelLeft'],['literal',[-.8,0]],['literal',[.8,0]]],'text-anchor':['case',['get','labelLeft'],'right','left'],'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#bbe9dd','text-halo-width':0}});
  globe.on('click','city-labels',event=>selectCity(event.features[0].properties.id).catch(showError));
  globe.on('click','city-glow',event=>selectCity(event.features[0].properties.id).catch(showError));
  const tooltip=new maplibregl.Popup({closeButton:false,closeOnClick:false,offset:12});
  globe.on('mouseenter','city-glow',event=>{globe.getCanvas().style.cursor='pointer';const feature=event.features[0];tooltip.setLngLat(feature.geometry.coordinates).setText(feature.properties.name).addTo(globe);});
  globe.on('mouseleave','city-glow',()=>{globe.getCanvas().style.cursor='';tooltip.remove();});
});
document.querySelectorAll('[data-attribute]').forEach(button=>button.onclick=()=>{
  mapAttribute=button.dataset.attribute;$('distribution-label').textContent=button.textContent;
  $('distribution-picker').open=false;
  document.querySelectorAll('[data-attribute]').forEach(option=>option.setAttribute('aria-pressed',String(option===button)));
  setSelectedFootprint();renderTypeMap();
});
$('choose-city').onclick=()=>{const open=$('city-list').hidden;$('city-list').hidden=!open;$('choose-city').setAttribute('aria-expanded',String(open));};
$('close-inspector').onclick=closeInspector;
$('return-panorama').onclick=()=>{$('panorama-view').hidden=false;$('building-panel').hidden=true;$('return-panorama').hidden=true;$('panorama-title').textContent='Street view';$('inspector').scrollTop=0;};
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeInspector();$('distribution-picker').open=false;$('city-list').hidden=true;$('choose-city').setAttribute('aria-expanded','false');}});
const pauseRotation=()=>{globePauseUntil=performance.now()+8000;};
for(const event of ['mousedown','touchstart','wheel'])globe.on(event,pauseRotation);
let previousFrame=performance.now();
function rotateGlobe(time){
  const elapsed=Math.min(time-previousFrame,100);previousFrame=time;
  if(globeReady&&!$('world-view').hidden&&$('city-list').hidden&&time>globePauseUntil&&!globe.isMoving()&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const center=globe.getCenter();globe.jumpTo({center:[center.lng+elapsed*.0015,center.lat]});
  }
  requestAnimationFrame(rotateGlobe);
}
requestAnimationFrame(rotateGlobe);
$('back').onclick=showWorld;$('detect').onclick=()=>detected?selectPanorama(pano.id):revealDetections();const initial=location.hash.slice(1);if(data.cities.some(c=>c.id===initial))await selectCity(initial);
if(document.modelContext?.registerTool){const register=tool=>Promise.resolve(document.modelContext.registerTool(tool)).catch(()=>{});register({name:'openfacades_select_city',description:'Navigate to one of the sample cities.',inputSchema:{type:'object',properties:{city:{type:'string',enum:data.cities.map(c=>c.id)}},required:['city'],additionalProperties:false},execute:async input=>{await selectCity(input.city);return{city:city.id,streetViews:city.panoramas.map(p=>p.id)};}});register({name:'openfacades_select_street_view',description:'Select a Mapillary panorama in the current city.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},execute:input=>{if(!city)throw Error('Select a city first');selectPanorama(input.id);return{id:pano.id,status:pano.status};}});register({name:'openfacades_show_detections',description:'Reveal all precomputed building boxes and viewing directions for the selected panorama.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:()=>{if(!pano||pano.status!=='ready'||!pano.buildings.length)throw Error('No detections available');revealDetections();return{buildingIds:pano.buildings.map(b=>b.id)};}});register({name:'openfacades_select_building',description:'Show the selected building projection and visual attributes.',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},execute:input=>{selectBuilding(input.id);return{id:building.id,attributes:building.attributes};}});}}
function showError(error){$('load-error').hidden=false;$('load-error').textContent=error.message;console.error(error);}
start().catch(showError);
