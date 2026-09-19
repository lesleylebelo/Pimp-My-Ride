import {useIsFocused} from '@react-navigation/native';
import React,{useEffect,useState} from 'react';
import {Text,View,Alert,Linking} from 'react-native';
import {reauthenticateWithCredential,EmailAuthProvider,getIdToken} from 'firebase/auth';
import {firebase} from '../../../shared/services/firebase';
import {guardedLogin} from '../../auth/services/loginCooldown';
import {useLoginCooldown} from '../../auth/hooks/useLoginCooldown';
import {authError} from '../../auth/utils/authErrors';
import {adminApi,adminError} from '../services/adminApi';
import {useAdminData} from '../services/useAdminData';
import {Page,Card,Button,Field,Notice,styles,when} from '../components/AdminUI';
function ConfirmButton({title,message,onConfirm,disabled,danger}){return <Button title={title} disabled={disabled} danger={danger} onPress={()=>Alert.alert(title,message,[{text:'Cancel',style:'cancel'},{text:'Confirm',style:danger?'destructive':'default',onPress:onConfirm}])}/>;}
export function AccountsScreen({navigation,route}){
 const [filter,setFilter]=useState(route.params?.filter||'all'),[cursor,setCursor]=useState(null),[search,setSearch]=useState('');
 const {data,busy,error,refresh}=useAdminData('accounts',{filter,cursor});
 const items=(data?.items||[]).filter(p=>`${p.id} ${p.fullName} ${p.email} ${p.shop?.shopName||''}`.toLowerCase().includes(search.toLowerCase()));
 return <Page title={filter==='pending'?'Shop review queue':'Accounts'}><View style={styles.row}>{['all','owner','shop','admin','pending','suspended','archived'].map(f=><Button key={f} title={`${f===filter?'✓ ':''}${f}`} onPress={()=>{setFilter(f);setCursor(null);}}/>)}</View>
 <Field label="Search this page by name, email or UID" value={search} onChangeText={setSearch}/><Text style={styles.muted}>30 accounts per page. New customers and shops register through the shared sign-up page. Admin accounts use trusted provisioning.</Text>
 <Notice busy={busy} error={error}/>{items.map(p=><Card key={p.id}><Text style={styles.heading}>{p.fullName}</Text><Text>{p.email}</Text><Text>{p.role} · {p.accountStatus||'active'}{p.role==='shop'?` · ${p.verificationStatus}`:''}</Text><Button title="Open account" onPress={()=>navigation.navigate('AdminAccount',{uid:p.id})}/></Card>)}
 {!busy&&data&&!items.length&&<Text>No matching accounts on this page.</Text>}
 <Button title="Refresh" disabled={busy} onPress={refresh}/>{data?.cursor&&<Button title="Next page" onPress={()=>setCursor(data.cursor)}/>}<Button title="First page" disabled={!cursor} onPress={()=>setCursor(null)}/>
 </Page>;
}
export function AccountDetailScreen({route,navigation}){
 const uid=route.params.uid,{data,busy,error,refresh}=useAdminData('account',{uid});
 const [form,setForm]=useState({}),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(data)setForm({fullName:data.fullName,phone:data.phone,shop:data.shop||{}});},[data]);
 async function action(op,extra){if(saving)return;setSaving(true);setMessage('');try{await adminApi(op,{uid,...extra});setMessage('Saved.');await refresh();}catch(e){setMessage(adminError(e));}finally{setSaving(false);}}
 async function viewDocument(kind){if(saving)return;setSaving(true);setMessage('');try{const {url}=await adminApi('document',{uid,kind});await Linking.openURL(url);}catch(e){setMessage(adminError(e));}finally{setSaving(false);}}
 const disabled=busy||saving;
 return <Page title={data?.fullName||'Account details'}><Notice busy={disabled} error={error||message}/><Button title="Confirm identity" onPress={()=>navigation.navigate('AdminConfirm')}/>
 {data&&<><Card><Text>{data.email}</Text><Text selectable>UID: {uid}</Text><Text>{data.role} · {data.accountStatus||'active'} · {data.emailVerified?'Email verified':'Email not verified'}</Text><Text>Last sign-in: {when(data.lastSignIn)}</Text>{data.statusReason&&<Text>Access note: {data.statusReason}</Text>}{data.statusOperation&&<Text>A server operation needs reconciliation. Contact the project operator.</Text>}</Card>
 {data.role!=='admin'&&<Card><Text style={styles.heading}>Profile</Text><Field label="Full name" value={form.fullName} onChangeText={fullName=>setForm(f=>({...f,fullName}))} maxLength={200}/><Field label="Phone" value={form.phone} onChangeText={phone=>setForm(f=>({...f,phone}))} keyboardType="phone-pad"/>
 {data.role==='shop'&&['shopName','regNumber','address','city','province','services'].map(k=><Field key={k} label={{shopName:'Shop name',regNumber:'Registration number',address:'Address',city:'City',province:'Province',services:'Services'}[k]} value={form.shop?.[k]} onChangeText={v=>setForm(f=>({...f,shop:{...f.shop,[k]:v}}))} maxLength={500}/>)}
 <Button title="Save profile" disabled={disabled||!form.fullName?.trim()||! /^(0\d{9}|\+27\d{9})$/.test((form.phone||'').replace(/[\s()-]/g,''))} onPress={()=>action('editAccount',form)}/></Card>}
 {data.role==='shop'&&<Card><Text style={styles.heading}>Verification · {data.verificationStatus}</Text><Text>{data.reviewReason||'No review note yet.'}</Text>
 {['cipcCert','proofOfAddress','ownerId'].map(kind=><Button key={kind} title={`View ${kind}`} disabled={disabled||!data.documents?.some(d=>d.id===kind)} onPress={()=>viewDocument(kind)}/>)}
 <Text style={styles.muted}>Private links expire after one minute. Review all three documents before approving. Use fictional documents for this academic project.</Text></Card>}
 {data.role!=='admin'&&<Card><Field label="Reason for review or account status change" value={reason} onChangeText={setReason} multiline maxLength={500}/>
 {data.role==='shop'&&['approved','rejected','pending'].map(status=><ConfirmButton key={status} title={{approved:'Approve shop',rejected:'Reject application',pending:'Request resubmission'}[status]} message="This decision changes shop access and is recorded in the audit log." disabled={disabled||!reason.trim()||(data.accountStatus&&data.accountStatus!=='active')} onConfirm={()=>action('review',{status,reason})}/>)}
 <ConfirmButton title="Suspend account" message="This restricts access and revokes existing sessions." disabled={disabled||!reason.trim()||data.accountStatus==='suspended'} danger onConfirm={()=>action('status',{status:'suspended',reason})}/>
 <ConfirmButton title="Restore account" message="This restores sign-in access. Shop approval is still required." disabled={disabled||!reason.trim()||!['suspended','archived'].includes(data.accountStatus)} onConfirm={()=>action('status',{status:'active',reason})}/>
 <ConfirmButton title="Archive account" message="This is reversible deletion: sign-in is disabled and records are retained for audit. It does not erase personal data." disabled={disabled||!reason.trim()||data.accountStatus==='archived'} danger onConfirm={()=>action('status',{status:'archived',reason})}/>
 </Card>}</>}
 <Button title="Reload account" disabled={disabled} onPress={refresh}/></Page>;
}
export function CategoriesScreen({navigation}){
 const {data,busy,error,refresh}=useAdminData('categories'),[form,setForm]=useState({name:'',description:''}),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 async function act(op,input){if(saving)return;setSaving(true);setMessage('');try{await adminApi(op,input);setForm({name:'',description:''});await refresh();}catch(e){setMessage(adminError(e));}finally{setSaving(false);}}
 return <Page title="Service categories"><Text style={styles.muted}>Create and maintain the service catalogue. Archiving hides a category without deleting historical references.</Text><Button title="Confirm identity" onPress={()=>navigation.navigate('AdminConfirm')}/><Notice busy={busy||saving} error={error||message}/>
 <Card><Text style={styles.heading}>{form.id?'Edit category':'New category'}</Text><Field label="Name" value={form.name} onChangeText={name=>setForm(f=>({...f,name}))} maxLength={80}/><Field label="Description" value={form.description} onChangeText={description=>setForm(f=>({...f,description}))} multiline maxLength={500}/><Button title="Save category" disabled={saving||!form.name.trim()||!form.description.trim()} onPress={()=>act('categorySave',form)}/>{form.id&&<Button title="Cancel editing" onPress={()=>setForm({name:'',description:''})}/>}</Card>
 {(data?.items||[]).map(c=><Card key={c.id}><Text style={styles.heading}>{c.name}{c.archived?' · Archived':''}</Text><Text>{c.description}</Text><Button title="Edit" disabled={saving} onPress={()=>setForm({id:c.id,name:c.name,description:c.description})}/><ConfirmButton title={c.archived?'Restore category':'Archive category'} message="This catalogue change will be recorded." disabled={saving} onConfirm={()=>act('categoryArchive',{id:c.id,archived:!c.archived})}/></Card>)}
 {data&&!data.items.length&&<Text>No categories yet. Add the first one above.</Text>}<Button title="Refresh" disabled={busy} onPress={refresh}/></Page>;
}
export function AuditScreen(){
 const [cursor,setCursor]=useState(null),[search,setSearch]=useState('');const {data,busy,error,refresh}=useAdminData('audit',{cursor});
 const items=(data?.items||[]).filter(i=>`${i.actor} ${i.target} ${i.action}`.toLowerCase().includes(search.toLowerCase()));
 return <Page title="Audit log"><Text style={styles.muted}>Server-recorded admin actions, registrations, document records and observed app sessions. Logs cannot be changed from the app.</Text><Field label="Filter this page by action or UID" value={search} onChangeText={setSearch}/><Notice busy={busy} error={error}/>
 {items.map(e=><Card key={e.id}><Text style={styles.heading}>{e.action}</Text><Text>{when(e.createdAt)}</Text><Text selectable>Actor: {e.actor}</Text><Text selectable>Target: {e.target}</Text>{Object.entries(e.details||{}).map(([k,v])=><Text key={k}>{k}: {Array.isArray(v)?v.join(', '):String(v)}</Text>)}</Card>)}
 {data&&!items.length&&<Text>No matching activity on this page.</Text>}<Button title="Refresh" disabled={busy} onPress={refresh}/>{data?.cursor&&<Button title="Older activity" onPress={()=>setCursor(data.cursor)}/>}<Button title="Latest activity" onPress={()=>setCursor(null)}/></Page>;
}
export function PresenceScreen({navigation}){
 const {data,busy,error,refresh}=useAdminData('presence'),focused=useIsFocused();
 useEffect(()=>{if(!focused)return;const t=setInterval(refresh,30000);return()=>clearInterval(t);},[refresh,focused]);
 return <Page title="Online & last seen"><Text style={styles.muted}>The 100 most recently seen accounts. “Online recently” means a foreground heartbeat within 90 seconds. A lost connection takes time to appear offline. Last sign-in is available in account details.</Text><Notice busy={busy} error={error}/>
 {(data?.items||[]).map(p=>{const online=Object.values(p.sessions||{}).some(deadline=>deadline>data.serverNow);return <Card key={p.id}><Text style={styles.heading}>{p.fullName||p.uid}</Text><Text>{p.role} · {online?'● Online recently':'Offline'}</Text><Text>Last seen: {when(p.lastSeen)}</Text><Button title="Open account" onPress={()=>navigation.navigate('AdminAccount',{uid:p.uid})}/></Card>;})}
 {data&&!data.items.length&&<Text>No observed sessions yet.</Text>}<Button title="Refresh status" disabled={busy} onPress={refresh}/></Page>;
}
export function ConfirmIdentityScreen({navigation}){
 const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const cooldown=useLoginCooldown();
 async function confirm(){if(busy||cooldown.seconds!==0)return;setBusy(true);setError('');try{const u=firebase().auth.currentUser;await guardedLogin(()=>reauthenticateWithCredential(u,EmailAuthProvider.credential(u.email,password)));await getIdToken(u,true);setPassword('');navigation.goBack();}catch(e){setPassword('');setError(authError(e));}finally{setBusy(false);}}
 return <Page title="Confirm it’s you"><Text>Sensitive admin actions require a sign-in or password confirmation within the last 15 minutes. Your password is never stored in the audit log.</Text><Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false}/><Notice busy={busy} error={error||cooldown.error}/><Button title={cooldown.seconds>0?`Try again in ${cooldown.seconds}s`:'Confirm password'} disabled={busy||!password||cooldown.seconds!==0} onPress={confirm}/></Page>;
}
