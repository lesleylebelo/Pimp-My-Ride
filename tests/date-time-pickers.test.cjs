const {test}=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{act,create}=require('react-test-renderer'),{loadUI}=require('./helpers/load-ui.cjs');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const dateTime=loadUI('src/shared/utils/dateTime.js');
const {palettes}=loadUI('src/shared/theme/colors.js');
const text=tree=>tree.root.findAllByType('Text').map(node=>node.props.children).join(' ');
const button=(tree,label)=>tree.root.findAllByType('Pressable').find(node=>node.props.accessibilityLabel===label);

function setup(platform='android',mode='dark') {
  const state={opened:[],dismissed:[],changes:[],blurs:0};
  const mocks={
    'react-native':{Platform:{OS:platform}},
    '../theme/ThemeContext':{useTheme:()=>({theme:palettes[mode],isDark:mode==='dark'})},
    '@react-native-community/datetimepicker':{__esModule:true,default:'NativeDateTimePicker',DateTimePickerAndroid:{open:props=>state.opened.push(props),dismiss:async mode=>{state.dismissed.push(mode);return true;}}},
  };
  return {state,load:file=>loadUI(file,mocks),onChange:value=>state.changes.push(value),onBlur:()=>{state.blurs++;}};
}
async function mounted(Component,props,run) {
  let tree;
  await act(async()=>{tree=create(React.createElement(Component,props));});
  const update=async changes=>{props={...props,...changes};await act(async()=>tree.update(React.createElement(Component,props)));};
  try {await run(tree,update);}finally{await act(async()=>tree.unmount());}
}

test('calendar and clock values reject rollover, invalid leap days, loose syntax and invalid Dates',()=>{
  for(const date of ['2030-02-29','2032-02-30','2030-13-01','2030-00-01','2030-1-01','2030-01-00','2030-01-01T00:00:00Z',null])assert.equal(dateTime.validCalendarDate(date),false);
  for(const time of ['24:00','12:60','9:30','09:30Z',null])assert.equal(dateTime.validClockTime(time),false);
  assert.equal(dateTime.validCalendarDate('2032-02-29'),true);
  assert.equal(dateTime.validClockTime('00:00'),true);
  assert.equal(dateTime.validClockTime('23:59'),true);
  assert.equal(dateTime.pickerValue(new Date(NaN),'date'),'');
});

test('SAST conversion preserves calendar dates and times across device zones, midnight and leap days',()=>{
  const previous=process.env.TZ;
  try {for(const zone of ['UTC','America/Los_Angeles','Pacific/Auckland','Africa/Johannesburg']){
    process.env.TZ=zone;
    for(const date of ['2030-01-02','2032-02-29','2099-12-31'])assert.equal(dateTime.pickerValue(dateTime.pickerDate(date,'date'),'date'),date);
    for(const time of ['00:00','00:30','23:59'])assert.equal(dateTime.pickerValue(dateTime.pickerDate(time,'time'),'time'),time);
    assert.equal(dateTime.sastToday(Date.parse('2030-01-01T21:59:59Z')),'2030-01-01');
    assert.equal(dateTime.sastToday(Date.parse('2030-01-01T22:00:00Z')),'2030-01-02');
    assert.match(dateTime.calendarDateLabel('2030-01-02'),/2.*Jan.*2030/);
    assert.equal(dateTime.pickerValue(new Date('2030-01-01T22:30:00Z'),'time'),'00:30');
  }}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test('Android native date selection publishes strings; dismissing, invalid selections and stale callbacks preserve the draft',async()=>{
  const s=setup(),Picker=s.load('src/shared/components/AppDatePicker.js').default;
  await mounted(Picker,{label:'Date',value:'2032-02-29',onChange:s.onChange,onBlur:s.onBlur},async(tree,update)=>{
    await act(async()=>button(tree,'Date').props.onPress());
    let dialog=s.state.opened.at(-1);
    assert.equal(dialog.timeZoneName,'Africa/Johannesburg');
    assert.equal(dateTime.pickerValue(dialog.value,'date'),'2032-02-29');
    await act(async()=>dialog.onDismiss());assert.deepEqual(s.state.changes,[]);
    await act(async()=>dialog.onValueChange({},new Date('2032-02-29T10:00:00Z')));assert.deepEqual(s.state.changes,[]);
    await act(async()=>button(tree,'Date').props.onPress());
    dialog=s.state.opened.at(-1);
    await act(async()=>dialog.onValueChange({},new Date('2032-02-29T10:00:00+02:00')));
    assert.deepEqual(s.state.changes,['2032-02-29']);
    await act(async()=>button(tree,'Date').props.onPress());
    dialog=s.state.opened.at(-1);
    await act(async()=>dialog.onValueChange({},new Date(NaN)));
    assert.deepEqual(s.state.changes,['2032-02-29']);assert.match(text(tree),/Choose a valid date/);
    await act(async()=>button(tree,'Date').props.onPress());
    dialog=s.state.opened.at(-1);await update({disabled:true});
    assert.deepEqual(s.state.dismissed,['date']);
    await act(async()=>dialog.onValueChange({},new Date('2033-01-01T10:00:00Z')));
    assert.deepEqual(s.state.changes,['2032-02-29']);
  });
});

test('Android date bounds and time ranges are enforced before publishing, including unsupported native time bounds',async()=>{
  const s=setup(),DatePicker=s.load('src/shared/components/AppDatePicker.js').default,TimePicker=s.load('src/shared/components/AppTimePicker.js').default;
  await mounted(DatePicker,{label:'Date',minimumDate:'2099-02-01',maximumDate:'2099-02-28',onChange:s.onChange},async tree=>{
    await act(async()=>button(tree,'Date').props.onPress());
    const dialog=s.state.opened.at(-1);
    assert.equal(dateTime.pickerValue(dialog.minimumDate,'date'),'2099-02-01');
    assert.equal(dateTime.pickerValue(dialog.maximumDate,'date'),'2099-02-28');
    await act(async()=>dialog.onValueChange({},new Date('2099-03-01T12:00:00+02:00')));
    assert.deepEqual(s.state.changes,[]);assert.match(text(tree),/up to 2099-02-28/);
  });
  await mounted(TimePicker,{label:'Time',value:'09:00',minimumTime:'08:00',maximumTime:'17:00',onChange:s.onChange},async tree=>{
    await act(async()=>button(tree,'Time').props.onPress());let dialog=s.state.opened.at(-1);
    assert.equal(dialog.is24Hour,true);assert.equal(dialog.minimumDate,undefined);
    await act(async()=>dialog.onValueChange({},new Date('2030-01-01T17:01:00+02:00')));
    assert.deepEqual(s.state.changes,[]);
    await act(async()=>button(tree,'Time').props.onPress());dialog=s.state.opened.at(-1);
    await act(async()=>dialog.onValueChange({},new Date('2030-01-01T00:30:00Z')));
    assert.deepEqual(s.state.changes,[]);
    await act(async()=>button(tree,'Time').props.onPress());dialog=s.state.opened.at(-1);
    await act(async()=>dialog.onValueChange({},new Date('2030-01-01T08:30:00Z')));
    assert.deepEqual(s.state.changes,['10:30']);
  });
});

test('iOS picker commits only after Use selection; cancellation and external value changes discard its temporary draft',async()=>{
  const s=setup('ios'),Picker=s.load('src/shared/components/AppTimePicker.js').default;
  await mounted(Picker,{label:'Time',value:'14:30',onChange:s.onChange},async(tree,update)=>{
    await act(async()=>button(tree,'Time').props.onPress());
    await act(async()=>tree.root.findByType('NativeDateTimePicker').props.onValueChange({},new Date('2030-01-01T16:45:00+02:00')));
    assert.deepEqual(s.state.changes,[]);
    await act(async()=>button(tree,'Cancel').props.onPress());assert.deepEqual(s.state.changes,[]);
    await act(async()=>button(tree,'Time').props.onPress());
    assert.equal(dateTime.pickerValue(tree.root.findByType('NativeDateTimePicker').props.value,'time'),'14:30');
    await act(async()=>tree.root.findByType('NativeDateTimePicker').props.onValueChange({},new Date('2030-01-01T16:45:00+02:00')));
    await act(async()=>button(tree,'Use selection').props.onPress());assert.deepEqual(s.state.changes,['16:45']);
    await act(async()=>button(tree,'Time').props.onPress());await update({value:'12:00'});
    assert.equal(tree.root.findAllByType('NativeDateTimePicker').length,0);
  });
});

test('web native controls expose keyboard labels, themes, ranges, errors, optional clearing and disabled guards',async()=>{
  for(const mode of ['dark','light']){
    const s=setup('web',mode),Picker=s.load('src/shared/components/AppDatePicker.js').default;
    await mounted(Picker,{label:'Preferred date',value:'2030-01-02',minimumDate:'2030-01-01',maximumDate:'2030-02-01',clearable:true,onChange:s.onChange},async(tree,update)=>{
      let input=tree.root.findByType('input');
      assert.equal(input.props.type,'date');assert.equal(input.props['aria-label'],'Preferred date');assert.ok(input.props['aria-describedby']);
      assert.equal(input.props.style.colorScheme,mode);assert.equal(input.props.min,'2030-01-01');assert.equal(input.props.max,'2030-02-01');
      await act(async()=>input.props.onChange({target:{value:'2030-01-03',validity:{badInput:false}}}));assert.deepEqual(s.state.changes,['2030-01-03']);
      await act(async()=>input.props.onChange({target:{value:'2030-02-30',validity:{badInput:false}}}));assert.deepEqual(s.state.changes,['2030-01-03']);
      assert.equal(tree.root.findByType('input').props['aria-invalid'],true);
      await act(async()=>button(tree,'Clear Preferred date').props.onPress());assert.deepEqual(s.state.changes,['2030-01-03','']);
      await update({disabled:true});input=tree.root.findByType('input');assert.equal(input.props.disabled,true);
      await act(async()=>input.props.onChange({target:{value:'2030-01-04',validity:{badInput:false}}}));assert.deepEqual(s.state.changes,['2030-01-03','']);
    });
  }
});

test('web time selection remains a minute-precision SAST string and invalid/empty saved values are safe',async()=>{
  const s=setup('web'),Picker=s.load('src/shared/components/AppTimePicker.js').default;
  await mounted(Picker,{label:'Time',value:'bad saved value',onChange:s.onChange},async(tree,update)=>{
    let input=tree.root.findByType('input');assert.equal(input.props.value,'');assert.equal(input.props.type,'time');assert.equal(input.props.step,60);assert.match(text(tree),/Choose a valid time/);
    await act(async()=>input.props.onChange({target:{value:'',validity:{badInput:true}}}));assert.deepEqual(s.state.changes,[]);
    await update({value:''});input=tree.root.findByType('input');assert.equal(input.props.value,'');
    await act(async()=>input.props.onChange({target:{value:'00:30',validity:{badInput:false}}}));assert.deepEqual(s.state.changes,['00:30']);
    await act(async()=>input.props.onChange({target:{value:'',validity:{badInput:false}}}));assert.deepEqual(s.state.changes,['00:30','']);
  });
});

test('invalid picker bounds disable selection rather than silently allowing unrestricted scheduling',async()=>{
  const s=setup('web'),Picker=s.load('src/shared/components/AppDatePicker.js').default;
  await mounted(Picker,{label:'Date',minimumDate:'2030-02-01',maximumDate:'2030-01-01',onChange:s.onChange},async tree=>{
    assert.equal(tree.root.findByType('input').props.disabled,true);assert.match(text(tree),/range is unavailable/);
  });
});
