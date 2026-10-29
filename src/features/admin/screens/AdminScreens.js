import {useIsFocused} from '@react-navigation/native';
import React,{useEffect,useRef,useState} from 'react';
import {Text,View,Linking} from 'react-native';
import {reauthenticateWithCredential,EmailAuthProvider,getIdToken} from 'firebase/auth';
import {firebase} from '../../../shared/services/firebase';
import {guardedLogin} from '../../auth/services/loginCooldown';
import {useLoginCooldown} from '../../auth/hooks/useLoginCooldown';
import {authError} from '../../auth/utils/authErrors';
import {adminApi,adminError} from '../services/adminApi';
import {useAdminData} from '../services/useAdminData';
import {Page,Card,Button,Field,Notice,useAdminStyles,when,Status,DataRow,Detail,Disclosure,Dialog,FormGrid,ConfirmButton} from '../components/AdminUI';
import {filterLabels,eventLabel} from '../utils/presentation';
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
 const styles=useAdminStyles();
 const [filter,setFilter]=useState(route.params?.filter||'all'),[search,setSearch]=useState(''),[cursor,setCursor]=useState(null);
 const {data,busy,error,refresh}=useAdminData('accounts',{filter,cursor}),feed=useInfiniteItems(data,busy,setCursor);
 const focused=useIsFocused(),wasFocused=useRef(focused);
 useEffect(()=>{if(focused&&!wasFocused.current){feed.reset();setCursor(null);}wasFocused.current=focused;},[focused]);
 useEffect(()=>{const next=route.params?.filter||'all';if(next!==filter){feed.reset();setCursor(null);setFilter(next);}},[route.params?.filter]);
 const items=feed.items.filter(p=>`${p.id} ${p.fullName} ${p.email} ${p.shop?.shopName||''}`.toLowerCase().includes(search.toLowerCase()));
 return <Page title={filter==='pending'?'Shop review queue':'Accounts'} onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}>
  <View style={styles.row}>{['all','owner','shop','admin','pending','suspended','archived'].map(f=><Button key={f} title={filterLabels[f]} selected={f===filter} primary={f===filter} disabled={busy} onPress={()=>{if(busy)return;feed.reset();setCursor(null);setFilter(f);navigation.setParams?.({filter:f});}}/>)}</View>
  <Field label="Search accounts by name, email or UID" value={search} onChangeText={setSearch}/>
  <Text style={styles.muted}>Search covers loaded accounts. Scroll to load more.</Text>
  <Notice busy={busy} error={error}/>
  <View style={{gap:8}}><DataRow header cells={['Account','Email','Role','Status']} action={<Text style={styles.muted}>Action</Text>}/>
  {items.map(p=><DataRow key={p.id} cells={[<View style={{gap:4}}><Text style={styles.heading}>{p.fullName||p.shop?.shopName||'Unnamed account'}</Text>{!!p.shop?.shopName&&<Text style={styles.muted}>{p.shop.shopName}</Text>}</View>,p.email||'Not recorded',filterLabels[p.role]||p.role,<View style={{gap:6}}><Status value={p.accountStatus||'active'}/>{p.role==='shop'&&<Status value={p.verificationStatus}/>}</View>]} action={<Button title="View details" onPress={()=>navigation.navigate('AdminAccount',{uid:p.id,section:filter==='pending'?'applications':'accounts'})}/>}/>)}
  </View>
  {!busy&&data&&!items.length&&<Text style={styles.muted}>No matching accounts loaded yet.</Text>}
  <View style={styles.row}><Button title="Refresh" disabled={busy} onPress={()=>{feed.reset();setCursor(null);if(cursor===null)void refresh();}}/></View>
  {busy&&!!feed.items.length&&<Text style={styles.muted}>Loading more accounts...</Text>}
 </Page>;
}

export function AccountDetailScreen({route,navigation}){
 const styles=useAdminStyles();
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
 return <Page title={data?.fullName||'Account details'}>
  <Notice busy={disabled} error={error||(message!=='Saved.'?message:'')} message={message==='Saved.'?message:''}/>
  {data&&<>
   <Card>
    <Text style={styles.heading}>{data.fullName||data.shop?.shopName||'Account details'}</Text>
    <Detail label="Email">{data.email}</Detail>
    <View style={styles.row}><Status value={data.role} label={filterLabels[data.role]||data.role}/><Status value={data.accountStatus||'active'}/><Status value={data.emailVerified?'active':'pending'} label={data.emailVerified?'Email verified':'Email not verified'}/></View>
    <Detail label="Last sign-in">{when(data.lastSignIn)}</Detail>
    <Disclosure><Detail label="Account UID">{uid}</Detail></Disclosure>
    {data.statusReason&&<Text style={styles.muted}>Access note: {data.statusReason}</Text>}
    {data.statusOperation&&<Text style={styles.muted}>A server operation needs reconciliation. Contact the project operator.</Text>}{data.statusOperation?.startsWith('self:')&&<Button title="Resume account cleanup" disabled={disabled} onPress={()=>void action('accountLifecycleResume',{}).catch(()=>{})}/>}
   </Card>
   {['owner','shop'].includes(data.role)&&!['deleting','deleted'].includes(data.accountStatus)&&<Card>
    <Text style={styles.heading}>Profile</Text>
    <FormGrid>
    <ValidatedField label="Full name" value={form.fullName} error={fieldError('fullName')} onBlur={()=>touch('fullName')} onChangeText={fullName=>editForm('fullName',f=>({...f,fullName}))} maxLength={200} editable={!saving}/>
    <ValidatedField label="Phone" value={form.phone} error={fieldError('phone')} onBlur={()=>touch('phone')} onChangeText={phone=>editForm('phone',f=>({...f,phone}))} keyboardType="phone-pad" maxLength={30} editable={!saving}/>
    {data.role==='shop'&&Object.entries(shopFields).map(([k,label])=><ValidatedField key={k} label={label} value={form.shop?.[k]} error={fieldError(`shop.${k}`)} onBlur={()=>touch(`shop.${k}`)} onChangeText={v=>editForm(`shop.${k}`,f=>({...f,shop:{...f.shop,[k]:v}}))} maxLength={500} editable={!saving}/>)}
    </FormGrid>
    <View style={styles.row}><Button title="Save profile" primary disabled={disabled||hasErrors(errors)} onPress={saveProfile}/></View>
   </Card>}
   {data.role==='shop'&&<Card>
    <Text style={styles.heading}>Workshop application</Text><Status value={data.verificationStatus}/>
    <Text style={styles.muted}>{data.reviewReason||'No review note yet.'}</Text>
    <View style={styles.row}>{['cipcCert','proofOfAddress','ownerId'].map(kind=><Button key={kind} title={{cipcCert:'Registration certificate',proofOfAddress:'Proof of address',ownerId:'Owner ID'}[kind]} disabled={disabled||!data.documents?.some(d=>d.id===kind)} onPress={()=>viewDocument(kind)}/>)}</View>
    <Text style={styles.muted}>Private links expire after one minute. Review all three documents before approving. Use fictional documents for this academic project.</Text>
   </Card>}
   {['owner','shop'].includes(data.role)&&!['deleting','deleted'].includes(data.accountStatus)&&<Card>
    <Text style={styles.heading}>Account actions</Text>
    <Text style={styles.muted}>Sensitive actions require identity verification within 15 minutes. Verify, then retry your action.</Text>
    <View style={styles.row}><Button title="Verify identity" disabled={saving} onPress={()=>navigation.navigate('AdminConfirm',{section:route.params.section||'accounts'})}/></View>
    <ValidatedField label="Reason for review or account status change" value={reason} error={touched.reason?reasonError:null} onBlur={()=>touch('reason')} onChangeText={v=>{touch('reason');setReason(v);}} multiline maxLength={500} editable={!saving}/>
    <View style={styles.row}>
    {data.reviewOperation&&<ConfirmButton title="Recover interrupted review" message="After two minutes, return this review to pending without approving it. Account restrictions remain in place." disabled={disabled||!!reasonError} onConfirm={()=>action('reviewRecover',{operationId:data.reviewOperation,reason})}/>}
    {data.role==='shop'&&['approved','rejected','pending'].map(status=><ConfirmButton key={status} title={{approved:'Approve shop',rejected:'Reject application',pending:'Request resubmission'}[status]} danger={status==='rejected'} message="This decision changes shop access and is recorded in the audit log." disabled={disabled||!!reasonError||(data.accountStatus&&data.accountStatus!=='active')} onConfirm={()=>action('review',{status,reason})}/>)}
    </View><View style={styles.row}>
    <ConfirmButton title="Suspend account" message="This restricts access and revokes existing sessions." disabled={disabled||!!reasonError||data.accountStatus==='suspended'} danger onConfirm={()=>action('status',{status:'suspended',reason})}/>
    <ConfirmButton title="Restore account" message="This restores sign-in access. Shop approval is still required." disabled={disabled||!!reasonError||!['suspended','archived'].includes(data.accountStatus)} onConfirm={()=>action('status',{status:'active',reason})}/>
    <ConfirmButton title="Archive account" message="This is reversible deletion: sign-in is disabled and records are retained for audit. It does not erase personal data." disabled={disabled||!!reasonError||data.accountStatus==='archived'} danger onConfirm={()=>action('status',{status:'archived',reason})}/>
    </View>
   </Card>}
  </>}
  <View style={styles.row}><Button title="Reload account" disabled={disabled} onPress={refresh}/></View>
 </Page>;
}

export function CategoriesScreen({navigation}){
 const styles=useAdminStyles();
 const [cursor,setCursor]=useState(null),{data,busy,error,refresh}=useAdminData('categories',{cursor}),feed=useInfiniteItems(data,busy,setCursor);
 const [form,setForm]=useState({name:'',description:''}),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[search,setSearch]=useState(''),[touched,setTouched]=useState({}),[submitted,setSubmitted]=useState(false),[editor,setEditor]=useState(false);
 const actionLock=useRef(false),errors=categoryErrors(form),disabled=busy||saving;
 const touch=key=>setTouched(t=>({...t,[key]:true}));
 function newForm(value={name:'',description:''}){setForm(value);setTouched({});setSubmitted(false);}
 async function act(op,input){if(actionLock.current)return;actionLock.current=true;setSaving(true);setMessage('');try{await adminApi(op,input);if(op==='categorySave'){newForm();setEditor(false);}setMessage('Saved.');feed.reset();setCursor(null);if(cursor===null)await refresh();}catch(e){setMessage(adminError(e));throw e;}finally{actionLock.current=false;setSaving(false);}}
 function saveCategory(){setSubmitted(true);if(disabled||hasErrors(errors))return;void act('categorySave',form).catch(()=>{});}
 const items=feed.items.filter(c=>`${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase()));
 return <Page title="Service categories" onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}>
  <View style={[styles.row,{justifyContent:'space-between'}]}><Text style={styles.muted}>Manage the service catalogue.</Text><Button title="Add Category" primary disabled={saving} onPress={()=>{newForm();setEditor(true);}}/></View>
  <Notice busy={disabled} error={error||(message!=='Saved.'?message:'')} message={message==='Saved.'?message:''}/>
  <Dialog visible={editor} title={form.id?'Edit category':'Add Category'} busy={saving} onClose={()=>setEditor(false)}>
   <Notice error={message!=='Saved.'?message:''} busy={saving}/>
   <ValidatedField label="Name" value={form.name} error={(touched.name||submitted)?errors.name:null} onBlur={()=>touch('name')} onChangeText={name=>{touch('name');setForm(f=>({...f,name}));}} maxLength={80} editable={!saving}/>
   <ValidatedField label="Description" value={form.description} error={(touched.description||submitted)?errors.description:null} onBlur={()=>touch('description')} onChangeText={description=>{touch('description');setForm(f=>({...f,description}));}} multiline maxLength={500} editable={!saving}/>
   <Button title="Save category" primary disabled={disabled||hasErrors(errors)} onPress={saveCategory}/>
   <Text style={styles.muted}>Changes require identity verification within 15 minutes. Verify, then retry. Your draft is kept.</Text>
   <Button title="Verify identity" disabled={saving} onPress={()=>{setEditor(false);navigation.navigate('AdminConfirm',{section:'categories'});}}/>
  </Dialog>
  {!editor&&!!(form.name||form.description)&&<Button title="Resume category draft" onPress={()=>setEditor(true)}/>}
  <Field label="Search categories by name or description" value={search} onChangeText={setSearch}/>
  <Text style={styles.muted}>Search covers loaded categories. Archiving keeps historical references.</Text>
  <View style={{gap:8}}><DataRow actionWidth={240} header cells={['Category','Description','Status']} action={<Text style={styles.muted}>Actions</Text>}/>
  {items.map(c=><DataRow actionWidth={240} key={c.id} cells={[c.name,c.description||'No description',<Status value={c.archived?'archived':'active'}/>]} action={<View style={styles.row}><Button title="Edit" disabled={disabled} onPress={()=>{newForm({id:c.id,name:c.name,description:c.description});setEditor(true);}}/><ConfirmButton title={c.archived?'Restore category':'Archive category'} danger={!c.archived} message={c.archived?'Restore this category to the catalogue? This change is recorded.':'Hide this category from the catalogue? Historical references are retained. This change is recorded.'} disabled={disabled} onConfirm={()=>act('categoryArchive',{id:c.id,archived:!c.archived})}/></View>}/>)}
  </View>
  <View style={styles.row}><Button title="Verify identity" disabled={saving} onPress={()=>navigation.navigate('AdminConfirm',{section:'categories'})}/></View>
  {!busy&&data&&!items.length&&<Text style={styles.muted}>No matching categories loaded yet.</Text>}
  <View style={styles.row}><Button title="Refresh" disabled={disabled} onPress={refresh}/></View>
  {busy&&!!feed.items.length&&<Text style={styles.muted}>Loading more categories...</Text>}
 </Page>;
}

export function AuditScreen(){
 const styles=useAdminStyles();
 const [cursor,setCursor]=useState(null),[search,setSearch]=useState('');
 const {data,busy,error,refresh}=useAdminData('audit',{cursor}),feed=useInfiniteItems(data,busy,setCursor);
 const items=feed.items.filter(i=>`${i.actor} ${i.target} ${i.action} ${eventLabel(i.action)}`.toLowerCase().includes(search.toLowerCase()));
 return <Page title="Audit log" onScroll={feed.onScroll} onLayout={feed.onLayout} onContentSizeChange={feed.onContentSizeChange}>
  <Text style={styles.muted}>Immutable server activity, newest first. Search covers loaded records.</Text>
  <Field label="Filter audit history by action or UID" value={search} onChangeText={setSearch}/>
  <Notice busy={busy} error={error}/>
  {items.map(e=><Card key={e.id}>
    <DataRow cells={[eventLabel(e.action),when(e.createdAt)]}/>
    <View style={styles.row}><Text style={styles.muted}>Actor: {e.actor||'Not recorded'}</Text><Text style={styles.muted}>Target: {e.target||'Not recorded'}</Text></View>
    <Disclosure title="Event details"><Detail label="Event code">{e.action}</Detail><Detail label="Record ID">{e.id}</Detail>
    {Object.entries(e.details||{}).map(([k,v])=><Detail key={k} label={k}>{typeof v==='object'?JSON.stringify(v):String(v)}</Detail>)}
    </Disclosure>
  </Card>)}
  {data&&!items.length&&<Text style={styles.muted}>No matching activity loaded yet.</Text>}
  <View style={styles.row}><Button title="Refresh" disabled={busy} onPress={refresh}/></View>
  {busy&&!!feed.items.length&&<Text style={styles.muted}>Loading older activity...</Text>}
  <View style={styles.row}><Button title="Latest activity" disabled={!cursor||busy} onPress={()=>{feed.reset();setCursor(null);}}/></View>
 </Page>;
}

export function PresenceScreen({navigation}){
 const styles=useAdminStyles();
 const {data,busy,error,refresh}=useAdminData('presence'),focused=useIsFocused();
 useEffect(()=>{if(!focused)return;const t=setInterval(refresh,30000);return()=>clearInterval(t);},[refresh,focused]);
 return <Page title="Online Status">
  <Text style={styles.muted}>Up to 100 recently seen accounts. “Online recently” means a foreground heartbeat within 90 seconds; connection loss may take time to appear.</Text>
  <Notice busy={busy} error={error}/>
  <View style={{gap:8}}><DataRow header cells={['Account','Role','Presence','Last seen']} action={<Text style={styles.muted}>Action</Text>}/>
  {(data?.items||[]).map(p=>{const online=Object.values(p.sessions||{}).some(deadline=>deadline>data.serverNow);return <DataRow key={p.id} cells={[p.fullName||'Unnamed account',filterLabels[p.role]||p.role,<Status value={online?'Online recently':'Offline'}/>,when(p.lastSeen)]} action={<Button title="View details" onPress={()=>navigation.navigate('AdminAccount',{uid:p.uid})}/>}/>;})}
  </View>
  {data&&!data.items.length&&<Text style={styles.muted}>No observed sessions yet.</Text>}
  <View style={styles.row}><Button title="Refresh" disabled={busy} onPress={refresh}/></View>
 </Page>;
}

export function ConfirmIdentityScreen({navigation}){
 const styles=useAdminStyles();
 const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const cooldown=useLoginCooldown(),confirmationLock=useRef(false);
 const focused=useIsFocused(),active=useRef(focused);
 useEffect(()=>{active.current=focused;if(!focused)setPassword('');return()=>{active.current=false;};},[focused]);
 async function confirm(){if(confirmationLock.current||!password||cooldown.seconds!==0||!active.current)return;confirmationLock.current=true;setBusy(true);setError('');try{const u=firebase().auth.currentUser;await guardedLogin(()=>reauthenticateWithCredential(u,EmailAuthProvider.credential(u.email,password)));await getIdToken(u,true);setPassword('');if(active.current)navigation.goBack();}catch(e){setPassword('');setError(authError(e));}finally{confirmationLock.current=false;setBusy(false);}}
 return <Page title="Verify identity"><Card style={{maxWidth:520,width:'100%',alignSelf:'center'}}>
  <Text style={styles.muted}>Enter your password to authorise sensitive actions for 15 minutes. You’ll return to your previous screen to retry the action.</Text>
  <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" editable={!busy} onSubmitEditing={confirm}/>
  <Notice busy={busy} error={error||cooldown.error}/>
  <Button title={cooldown.seconds>0?`Try again in ${cooldown.seconds}s`:'Confirm password'} primary disabled={busy||!password||cooldown.seconds!==0} onPress={confirm}/>
  <Button title="Cancel" disabled={busy} onPress={()=>{setPassword('');navigation.goBack();}}/>
 </Card></Page>;
}
