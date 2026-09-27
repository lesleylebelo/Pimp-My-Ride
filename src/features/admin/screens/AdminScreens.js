import {useIsFocused} from '@react-navigation/native';
import React,{useEffect,useRef,useState} from 'react';
import {Text,View,Linking} from 'react-native';
import ConfirmButton from '../../../shared/components/ConfirmationButton';
import {reauthenticateWithCredential,EmailAuthProvider,getIdToken} from 'firebase/auth';
import {firebase} from '../../../shared/services/firebase';
import {guardedLogin} from '../../auth/services/loginCooldown';
import {useLoginCooldown} from '../../auth/hooks/useLoginCooldown';
import {authError} from '../../auth/utils/authErrors';
import {adminApi,adminError} from '../services/adminApi';
import {useAdminData} from '../services/useAdminData';
import {Page,Card,Button,Field,Notice,styles,when} from '../components/AdminUI';
import {accountErrors,categoryErrors,hasErrors,requiredText,shopFields} from '../utils/validation';

function ValidatedField({error,...props}){return <View><Field {...props}/><Notice error={error}/></View>;}
const sameItem=(left,right)=>left===right||Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>Object.is(left[key],right[key]));
function useInfiniteItems(data,busy,setCursor){
 const [items,setItems]=useState([]),requested=useRef(new Set()),seen=useRef(new WeakSet()),viewport=useRef(0),content=useRef(0);
 useEffect(()=>{if(!data||seen.current.has(data))return;seen.current.add(data);setItems(previous=>{const indexes=new Map(previous.map((item,index)=>[item.id,index])),next=[...previous];let changed=false;for(const item of data.items||[]){const index=indexes.get(item.id);if(index===undefined){indexes.set(item.id,next.length);next.push(item);changed=true;}else if(!sameItem(next[index],item)){next[index]=item;changed=true;}}return changed?next:previous;});},[data]);
 const load=()=>{if(data?.cursor&&!busy&&!requested.current.has(data.cursor)){requested.current.add(data.cursor);setCursor(data.cursor);}};
 const onScroll=event=>{const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;if(contentSize.height-contentOffset.y-layoutMeasurement.height<260)load();};
 const onLayout=event=>{viewport.current=event.nativeEvent.layout.height;if(content.current-viewport.current<260)load();};
 const onContentSizeChange=(_,height)=>{content.current=height;if(height-viewport.current<260)load();};
 const reset=()=>{requested.current.clear();seen.current=new WeakSet();if(data)seen.current.add(data);setItems([]);};
 return {items,onScroll,onLayout,onContentSizeChange,reset};
}
export function AccountsScreen({navigation,route}){
 const [filter,setFilter]=useState(route.params?.filter||'all'),[search,setSearch]=useState(''),[cursor,setCursor]=useState(null);
 const {data,busy,error,refresh}=useAdminData('accounts',{filter,cursor}),feed=useInfiniteItems(data,busy,setCursor);
 const items=feed.items.filter(p=>`${p.id} ${p.fullName} ${p.email} ${p.shop?.shopName||''}`.toLowerCase().includes(search.toLowerCase()));
 return <Page title={filter==='pending'?'Shop review queue':'Accounts'} onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}><View style={styles.row}>{['all','owner','shop','admin','pending','suspended','archived'].map(f=><Button key={f} title={`${f===filter?'✓ ':''}${f}`} disabled={busy} onPress={()=>{if(busy)return;feed.reset();setCursor(null);setFilter(f);}}/>)}</View>
 <Field label="Search accounts by name, email or UID" value={search} onChangeText={setSearch}/><Text style={styles.muted}>New customers and shops register through the shared sign-up page. Admin accounts use trusted provisioning.</Text>
 <Notice busy={busy} error={error}/>{items.map(p=><Card key={p.id}><Text style={styles.heading}>{p.fullName}</Text><Text>{p.email}</Text><Text>{p.role} · {p.accountStatus||'active'}{p.role==='shop'?` · ${p.verificationStatus}`:''}</Text><Button title="Open account" onPress={()=>navigation.navigate('AdminAccount',{uid:p.id})}/></Card>)}
 {!busy&&data&&!items.length&&<Text>No matching accounts loaded yet.</Text>}
 <Button title="Refresh" disabled={busy} onPress={refresh}/>{busy&&!!feed.items.length&&<Text style={styles.muted}>Loading more accounts...</Text>}
 </Page>;
}
export function AccountDetailScreen({route,navigation}){
 const uid=route.params.uid,{data,busy,error,refresh}=useAdminData('account',{uid});
 const [form,setForm]=useState({}),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[touched,setTouched]=useState({}),[submitted,setSubmitted]=useState(false);
 const dirty=useRef(false),actionLock=useRef(false);
 useEffect(()=>{dirty.current=false;setForm({});setReason('');setTouched({});setSubmitted(false);setMessage('');},[uid]);
 useEffect(()=>{if(data&&!dirty.current)setForm({fullName:data.fullName,phone:data.phone,shop:data.shop||{}});},[data]);
 const touch=key=>setTouched(t=>({...t,[key]:true}));
 const editForm=(key,change)=>{dirty.current=true;touch(key);setForm(change);};
 const errors=accountErrors(form,data?.role),reasonError=requiredText(reason,'Reason',500);
 const fieldError=key=>(touched[key]||submitted)?errors[key]:null;
 function saveProfile(){setSubmitted(true);if(busy||saving||hasErrors(errors))return;void action('editAccount',form).catch(()=>{});}
 async function action(op,extra){if(actionLock.current)return;actionLock.current=true;setSaving(true);setMessage('');try{await adminApi(op,{uid,...extra});if(op==='editAccount')dirty.current=false;setMessage('Saved.');await refresh();}catch(e){setMessage(adminError(e));throw e;}finally{actionLock.current=false;setSaving(false);}}
 async function viewDocument(kind){if(busy||actionLock.current)return;actionLock.current=true;setSaving(true);setMessage('');try{const {url}=await adminApi('document',{uid,kind});await Linking.openURL(url);}catch(e){setMessage(adminError(e));}finally{actionLock.current=false;setSaving(false);}}
 const disabled=busy||saving;
 return <Page title={data?.fullName||'Account details'}><Notice busy={disabled} error={error||message}/><Button title="Confirm identity" disabled={saving} onPress={()=>navigation.navigate('AdminConfirm')}/>
 {data&&<><Card><Text>{data.email}</Text><Text selectable>UID: {uid}</Text><Text>{data.role} · {data.accountStatus||'active'} · {data.emailVerified?'Email verified':'Email not verified'}</Text><Text>Last sign-in: {when(data.lastSignIn)}</Text>{data.statusReason&&<Text>Access note: {data.statusReason}</Text>}{data.statusOperation&&<Text>A server operation needs reconciliation. Contact the project operator.</Text>}</Card>
 {data.role!=='admin'&&<Card><Text style={styles.heading}>Profile</Text><ValidatedField label="Full name" value={form.fullName} error={fieldError('fullName')} onBlur={()=>touch('fullName')} onChangeText={fullName=>editForm('fullName',f=>({...f,fullName}))} maxLength={200} editable={!saving}/><ValidatedField label="Phone" value={form.phone} error={fieldError('phone')} onBlur={()=>touch('phone')} onChangeText={phone=>editForm('phone',f=>({...f,phone}))} keyboardType="phone-pad" maxLength={30} editable={!saving}/>
 {data.role==='shop'&&Object.entries(shopFields).map(([k,label])=><ValidatedField key={k} label={label} value={form.shop?.[k]} error={fieldError(`shop.${k}`)} onBlur={()=>touch(`shop.${k}`)} onChangeText={v=>editForm(`shop.${k}`,f=>({...f,shop:{...f.shop,[k]:v}}))} maxLength={500} editable={!saving}/>)}
 <Button title="Save profile" disabled={disabled||hasErrors(errors)} onPress={saveProfile}/></Card>}
 {data.role==='shop'&&<Card><Text style={styles.heading}>Verification · {data.verificationStatus}</Text><Text>{data.reviewReason||'No review note yet.'}</Text>
 {['cipcCert','proofOfAddress','ownerId'].map(kind=><Button key={kind} title={`View ${kind}`} disabled={disabled||!data.documents?.some(d=>d.id===kind)} onPress={()=>viewDocument(kind)}/>)}
 <Text style={styles.muted}>Private links expire after one minute. Review all three documents before approving. Use fictional documents for this academic project.</Text></Card>}
 {data.role!=='admin'&&<Card><ValidatedField label="Reason for review or account status change" value={reason} error={touched.reason?reasonError:null} onBlur={()=>touch('reason')} onChangeText={v=>{touch('reason');setReason(v);}} multiline maxLength={500} editable={!saving}/>
 {data.reviewOperation&&<ConfirmButton title="Recover interrupted review" message="After two minutes, return this review to pending without approving it. Account restrictions remain in place." disabled={disabled||!!reasonError} onConfirm={()=>action('reviewRecover',{operationId:data.reviewOperation,reason})}/>}
  {data.role==='shop'&&['approved','rejected','pending'].map(status=><ConfirmButton key={status} title={{approved:'Approve shop',rejected:'Reject application',pending:'Request resubmission'}[status]} message="This decision changes shop access and is recorded in the audit log." disabled={disabled||!!reasonError||(data.accountStatus&&data.accountStatus!=='active')} onConfirm={()=>action('review',{status,reason})}/>)}
 <ConfirmButton title="Suspend account" message="This restricts access and revokes existing sessions." disabled={disabled||!!reasonError||data.accountStatus==='suspended'} danger onConfirm={()=>action('status',{status:'suspended',reason})}/>
 <ConfirmButton title="Restore account" message="This restores sign-in access. Shop approval is still required." disabled={disabled||!!reasonError||!['suspended','archived'].includes(data.accountStatus)} onConfirm={()=>action('status',{status:'active',reason})}/>
 <ConfirmButton title="Archive account" message="This is reversible deletion: sign-in is disabled and records are retained for audit. It does not erase personal data." disabled={disabled||!!reasonError||data.accountStatus==='archived'} danger onConfirm={()=>action('status',{status:'archived',reason})}/>
 </Card>}</>}
 <Button title="Reload account" disabled={disabled} onPress={refresh}/></Page>;
}
export function CategoriesScreen({navigation}){
 const [cursor,setCursor]=useState(null),{data,busy,error,refresh}=useAdminData('categories',{cursor}),feed=useInfiniteItems(data,busy,setCursor);
 const [form,setForm]=useState({name:'',description:''}),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[search,setSearch]=useState(''),[touched,setTouched]=useState({}),[submitted,setSubmitted]=useState(false);
 const actionLock=useRef(false),errors=categoryErrors(form),disabled=busy||saving;
 const touch=key=>setTouched(t=>({...t,[key]:true}));
 function newForm(value={name:'',description:''}){setForm(value);setTouched({});setSubmitted(false);}
 async function act(op,input){if(actionLock.current)return;actionLock.current=true;setSaving(true);setMessage('');try{await adminApi(op,input);if(op==='categorySave')newForm();await refresh();}catch(e){setMessage(adminError(e));throw e;}finally{actionLock.current=false;setSaving(false);}}
 function saveCategory(){setSubmitted(true);if(disabled||hasErrors(errors))return;void act('categorySave',form).catch(()=>{});}
 const items=feed.items.filter(c=>`${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase()));
 return <Page title="Service categories" onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}><Text style={styles.muted}>Create and maintain the service catalogue. Archiving hides a category without deleting historical references.</Text><Button title="Confirm identity" disabled={saving} onPress={()=>navigation.navigate('AdminConfirm')}/><Notice busy={disabled} error={error||message}/>
 <Card><Text style={styles.heading}>{form.id?'Edit category':'New category'}</Text><ValidatedField label="Name" value={form.name} error={(touched.name||submitted)?errors.name:null} onBlur={()=>touch('name')} onChangeText={name=>{touch('name');setForm(f=>({...f,name}));}} maxLength={80} editable={!saving}/><ValidatedField label="Description" value={form.description} error={(touched.description||submitted)?errors.description:null} onBlur={()=>touch('description')} onChangeText={description=>{touch('description');setForm(f=>({...f,description}));}} multiline maxLength={500} editable={!saving}/><Button title="Save category" disabled={disabled||hasErrors(errors)} onPress={saveCategory}/>{form.id&&<Button title="Cancel editing" disabled={saving} onPress={()=>newForm()}/>}</Card>
 <Field label="Search categories by name or description" value={search} onChangeText={setSearch}/>
 {items.map(c=><Card key={c.id}><Text style={styles.heading}>{c.name}{c.archived?' · Archived':''}</Text><Text>{c.description}</Text><Button title="Edit" disabled={disabled} onPress={()=>newForm({id:c.id,name:c.name,description:c.description})}/><ConfirmButton title={c.archived?'Restore category':'Archive category'} message="This catalogue change will be recorded." disabled={disabled} onConfirm={()=>act('categoryArchive',{id:c.id,archived:!c.archived})}/></Card>)}
 {!busy&&data&&!items.length&&<Text>No matching categories loaded yet.</Text>}<Button title="Refresh" disabled={disabled} onPress={refresh}/>{busy&&!!feed.items.length&&<Text style={styles.muted}>Loading more categories...</Text>}</Page>;
}
export function AuditScreen(){
 const [cursor,setCursor]=useState(null),[search,setSearch]=useState('');const {data,busy,error,refresh}=useAdminData('audit',{cursor}),feed=useInfiniteItems(data,busy,setCursor);
 const items=feed.items.filter(i=>`${i.actor} ${i.target} ${i.action}`.toLowerCase().includes(search.toLowerCase()));
 return <Page title="Audit log" onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}><Text style={styles.muted}>Server-recorded admin actions, registrations, document records and observed app sessions. Logs cannot be changed from the app.</Text><Field label="Filter audit history by action or UID" value={search} onChangeText={setSearch}/><Notice busy={busy} error={error}/>
 {items.map(e=><Card key={e.id}><Text style={styles.heading}>{e.action}</Text><Text>{when(e.createdAt)}</Text><Text selectable>Actor: {e.actor}</Text><Text selectable>Target: {e.target}</Text>{Object.entries(e.details||{}).map(([k,v])=><Text key={k}>{k}: {Array.isArray(v)?v.join(', '):String(v)}</Text>)}</Card>)}
 {data&&!items.length&&<Text>No matching activity loaded yet.</Text>}<Button title="Refresh" disabled={busy} onPress={refresh}/>{busy&&!!feed.items.length&&<Text style={styles.muted}>Loading older activity...</Text>}<Button title="Latest activity" disabled={!cursor||busy} onPress={()=>{feed.reset();setCursor(null);}}/></Page>;
}
export function PresenceScreen({navigation}){
 const {data,busy,error,refresh}=useAdminData('presence'),focused=useIsFocused();
 useEffect(()=>{if(!focused)return;const t=setInterval(refresh,30000);return()=>clearInterval(t);},[refresh,focused]);
 return <Page title="Online & last seen"><Text style={styles.muted}>The 100 most recently seen accounts. “Online recently” means a foreground heartbeat within 90 seconds. A lost connection takes time to appear offline. Last sign-in is available in account details.</Text><Notice busy={busy} error={error}/>
 {(data?.items||[]).map(p=>{const online=Object.values(p.sessions||{}).some(deadline=>deadline>data.serverNow);return <Card key={p.id}><Text style={styles.heading}>{p.fullName||p.uid}</Text><Text>{p.role} · {online?'● Online recently':'Offline'}</Text><Text>Last seen: {when(p.lastSeen)}</Text><Button title="Open account" onPress={()=>navigation.navigate('AdminAccount',{uid:p.uid})}/></Card>;})}
 {data&&!data.items.length&&<Text>No observed sessions yet.</Text>}<Button title="Refresh status" disabled={busy} onPress={refresh}/></Page>;
}
export function ConfirmIdentityScreen({navigation}){
 const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const cooldown=useLoginCooldown(),confirmationLock=useRef(false);
 async function confirm(){if(confirmationLock.current||!password||cooldown.seconds!==0)return;confirmationLock.current=true;setBusy(true);setError('');try{const u=firebase().auth.currentUser;await guardedLogin(()=>reauthenticateWithCredential(u,EmailAuthProvider.credential(u.email,password)));await getIdToken(u,true);setPassword('');navigation.goBack();}catch(e){setPassword('');setError(authError(e));}finally{confirmationLock.current=false;setBusy(false);}}
 return <Page title="Confirm it’s you"><Text>Sensitive admin actions require a sign-in or password confirmation within the last 15 minutes. Your password is never stored in the audit log.</Text><Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false}/><Notice busy={busy} error={error||cooldown.error}/><Button title={cooldown.seconds>0?`Try again in ${cooldown.seconds}s`:'Confirm password'} disabled={busy||!password||cooldown.seconds!==0} onPress={confirm}/></Page>;
}
