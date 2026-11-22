'use strict';
const {clean,key,periods,labels,readWorkbook,statistics,consolidateSubjects} = Grades;
const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('es-ES',{maximumFractionDigits:2});
const dbKey = 'panel-calificaciones-v1:'+location.pathname.replace(/(?:index\.html)?\/?$/,'/');
const all = 'Todas';
let state={records:[],notes:{},actas:{}}, draft, view='results', studentKey='', activeReport, activeActaPeriod;
const recordKey = record => JSON.stringify([record.year,key(record.course),key(record.group),record.period]);
const studentId = (record,name) => JSON.stringify([record.year,key(record.course),key(record.group),key(name)]);
const validGrade = value => typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=10;
const distinct = items => [...new Set(items)].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
const fmtValue = value => value===null?'—':fmt.format(value);
const haveOwn = (object, name) => Object.prototype.hasOwnProperty.call(object,name);

function element(tag,text,cls) {
  const item=document.createElement(tag);
  if (text!==undefined) item.textContent=text;
  if (cls) item.className=cls;
  return item;
}
function message(text='',error=false) {
  $('status').textContent=text;
  $('status').classList.toggle('error',error);
}
function setOptions(id,items) {
  const select=$(id), previous=select.value;
  select.replaceChildren(...items.map(value=>Array.isArray(value)?new Option(value[1],value[0]):new Option(value)));
  if ([...select.options].some(option=>option.value===previous)) select.value=previous;
  select.disabled=select.options.length<2;
}
function validState(value) {
  const validActas=value?.actas===undefined || (value.actas && typeof value.actas==='object' && Object.values(value.actas).every(note=>note&&typeof note==='object'&&Object.values(note).every(text=>typeof text==='string')));
  return validActas && value && value.version===1 && Array.isArray(value.records) && value.notes && typeof value.notes==='object' &&
    Object.values(value.notes).every(note=>typeof note==='string') && value.records.every(record=>
      record && ['year','course','group'].every(property=>typeof record[property]==='string'&&record[property]) &&
      periods.includes(record.period) && (record.languageChoices===undefined || (record.languageChoices && typeof record.languageChoices==='object' && Object.values(record.languageChoices).every(value=>typeof value==='string'))) && Array.isArray(record.subjects) && record.subjects.every(subject=>typeof subject==='string') &&
      Array.isArray(record.students) && record.students.every(student=>student&&typeof student.name==='string'&&student.grades&&
        typeof student.grades==='object'&&Object.values(student.grades).every(validGrade)));
}
function persist(records,notes,actas=state.actas||{}) {
  const next={version:1,records,notes,actas};
  localStorage.setItem(dbKey,JSON.stringify(next));
  state=next;
}
function changeView(name) {
  view=name;
  if(name==='acta') activeActaPeriod=$('period').value || undefined;
  if(name==='grades' && !matrixPeriod) matrixPeriod=$('period').value || undefined;
  for(const button of document.querySelectorAll('[data-view]')) {
    if (button.dataset.view===view) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  }
  $('import').hidden=name!=='import';
  $('dashboard').hidden=name==='import';
  if (name==='import') showHistory();
  else refreshFilters();
}
function showHistory() {
  $('clear-imports').disabled=!state.records.length;
  const items=state.records.map(record=>element('li',record.year+' · '+record.course+' '+record.group+' · '+labels[record.period]+' · '+record.students.length+' alumnos'));
  $('history').replaceChildren(...(items.length?items:[element('li','Todavía no hay evaluaciones guardadas.')]));
}
function inputLabel(label,value,parent) {
  const wrapper=element('label',label);
  const input=element('input');
  input.value=value;
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}
async function readFile(event) {
  $('review').hidden=true;
  draft=undefined;
  const file=event.target.files[0];
  if(!file)return;
  if(file.size>20_000_000)throw Error('El archivo supera los 20 MB.');
  const bytes=await file.arrayBuffer();
  if(event.target.files[0]!==file)return;
  const result=readWorkbook(bytes,XLSX);
  $('review-info').textContent=result.sessions.length+' bloque(s) de evaluación. '+result.sessions.reduce((sum,item)=>sum+item.students.length,0)+' filas de alumnado detectadas.'+(result.unrecognized?' '+result.unrecognized+' celdas con valores no reconocidos quedaron sin nota.':'');
  const container=$('review-fields');
  container.replaceChildren();
  const year=inputLabel('Año académico',result.year,container);
  const entries=result.sessions.map(session=>{
    const row=element('div',undefined,'review-row');
    row.append(element('h4',labels[session.period]+' · '+session.students.length+' alumnos'));
    const course=inputLabel('Curso',session.course,row);
    const group=inputLabel('Grupo',session.group,row);
    const wrapper=element('label','Evaluación');
    const period=element('select');
    for(const option of periods)period.append(new Option(labels[option],option));
    period.value=session.period;
    wrapper.append(period);
    row.append(wrapper);
    container.append(row);
    return {session,course,group,period};
  });
  draft={year,entries};
  $('review').hidden=false;
}
function saveImport() {
  if(!draft)return;
  const year=clean(draft.year.value).replace(/[/-]/g,'–');
  if(!/^20\d{2}–\d{2}$/.test(year))throw Error('Indica el año académico en formato 2025–26.');
  const records=draft.entries.map(({session,course,group,period})=>({...session,year,course:clean(course.value),group:clean(group.value).toUpperCase(),period:period.value}));
  if(records.some(record=>!record.course||!record.group))throw Error('Completa el curso y el grupo.');
  const keys=new Set(records.map(recordKey));
  if(keys.size!==records.length)throw Error('Hay dos bloques con el mismo curso, grupo y evaluación.');
  if(state.records.some(record=>keys.has(recordKey(record)))&&!window.confirm('Ya existe una evaluación para ese curso y grupo. ¿Sustituir sus calificaciones?'))return;
  persist([...state.records.filter(record=>!keys.has(recordKey(record))),...records],state.notes);
  draft=undefined;
  $('file').value='';
  $('review').hidden=true;
  changeView('results');
  const latest=records.at(-1);
  for(const [id,value] of [['year',latest.year],['course',latest.course],['group',latest.group],['period',latest.period]]){
    $(id).value=value;
    refreshFilters();
  }
  message('Evaluación guardada en este navegador.');
}
function refreshFilters() {
  setOptions('year',distinct(state.records.map(record=>record.year)).reverse());
  const inYear=state.records.filter(record=>record.year===$('year').value);
  setOptions('course',distinct(inYear.map(record=>record.course)));
  $('course-label').hidden=view==='dop';
  $('group-label').hidden=view==='dop';
  if(view==='dop') {
    $('subject-label').hidden=true;
    $('period-label').hidden=true;
    $('language-review').hidden=true;
    dopDashboard(state.records.map(consolidateSubjects),$('year').value,openDopStudent);
    return;
  }
  const course=inYear.filter(record=>record.course===$('course').value);
  setOptions('group',[['','Todos los grupos'],...distinct(course.map(record=>record.group))]);
  const records=course.filter(record=>!$('group').value||record.group===$('group').value).map(consolidateSubjects);
  showLanguageConflicts(records);
  setOptions('period',periods.filter(period=>records.some(record=>record.period===period)).map(period=>[period,labels[period]]));
  const current=records.filter(record=>record.period===$('period').value);
  setOptions('subject',[['','Todas las materias'],...distinct(current.flatMap(record=>record.subjects))]);
  $('subject-label').hidden=view!=='results';
  $('period-label').hidden=['acta','grades','charts'].includes(view);
  if (view==='acta') showActa(records);
  else if (view==='students') showStudents(records,current);
  else if (view==='grades') showGradesTable(records);
  else if (view==='charts') gradesCharts(records);
  else showResults(records,current);
}
function showLanguageConflicts(records) {
  const review=$('language-review'), content=$('language-conflicts');
  const conflicts=records.flatMap(record=>record.languageConflicts.map(conflict=>({record,...conflict})));
  review.hidden=!conflicts.length;
  content.replaceChildren();
  if (!conflicts.length) return;
  const pending=conflicts.filter(item=>!item.chosen).length;
  review.querySelector('summary').textContent='Revisar notas de materias unificadas · '+pending+' pendientes';
  content.append(element('p','Hay cuadernos de la misma materia con notas diferentes. Elige la nota que corresponde. Si dejas la revisión pendiente, esa materia queda sin nota en los cálculos.'));
  for (const {record,student,subject,entries,choiceKey,chosen} of conflicts) {
    const label=element('label',student+' · Grupo '+record.group+' · '+labels[record.period]+' · '+subject);
    const select=element('select');
    select.append(new Option('Pendiente de revisión',''));
    for (const {source,value} of entries) select.append(new Option(source+' · '+fmt.format(value),source));
    select.value=chosen||'';
    select.onchange=()=>run(()=>{
      const value=select.value;
      const records=state.records.map(item=>{
        if (recordKey(item)!==recordKey(record)) return item;
        const languageChoices={...item.languageChoices};
        if (value) languageChoices[choiceKey]=value;
        else delete languageChoices[choiceKey];
        return {...item,languageChoices};
      });
      persist(records,state.notes);
      refreshFilters();
      message('Revisión de la calificación guardada.');
    });
    label.append(select);
    content.append(label);
  }
}
let matrixPeriod, matrixSortPeriod;
let matrixSort='';
const matrixSorts = {
  'mean-asc': {metric:'mean',direction:1,label:'Media de menor a mayor'},
  'mean-desc': {metric:'mean',direction:-1,label:'Media de mayor a menor'},
  'fail-asc': {metric:'fail',direction:1,label:'Suspensos de menor a mayor'},
  'fail-desc': {metric:'fail',direction:-1,label:'Suspensos de mayor a menor'}
};
const matrixPeriods = {'1EV':'1.ª','2EV':'2.ª','3EV':'3.ª',FINAL:'Final'};
function matrixData(records, selectedPeriods) {
  const rows = new Map();
  const subjects = new Set();
  for (const period of selectedPeriods) {
    for (const record of records.filter(item=>item.period===period)) {
      for (const subject of record.subjects) subjects.add(subject);
      for (const student of record.students) {
        const id = studentId(record,student.name);
        if (!rows.has(id)) rows.set(id,{name:student.name,group:record.group,terms:new Map()});
        rows.get(id).terms.set(period,student.grades);
      }
    }
  }
  return {subjects:[...subjects],rows:[...rows.values()]};
}
function showGradesTable(records) {
  const parent=$('content');
  parent.replaceChildren();
  if (!records.length) {empty(parent);return;}
  const title=element('h2','Tabla de notas');
  const context=element('p',[$('year').value,$('course').value,$('group').value?'Grupo '+$('group').value:'Todos los grupos'].join(' · '),'muted');
  const tabs=element('div',undefined,'filters matrix-tabs');
  tabs.setAttribute('role','group');
  tabs.setAttribute('aria-label','Evaluación de la tabla de notas');
  matrixPeriod ||= periods.find(period=>records.some(record=>record.period===period));
  for (const [value,label] of [...periods.map(period=>[period,labels[period]]),['all','Tabla general']]) {
    const button=element('button',label);
    button.setAttribute('aria-pressed',String(matrixPeriod===value));
    if (matrixPeriod===value) button.classList.add('primary');
    button.onclick=()=>{
      matrixPeriod=value;
      showGradesTable(records);
      parent.querySelector('button[aria-pressed="true"]').focus();
    };
    tabs.append(button);
  }
  parent.append(title,context,tabs);
  const combined=matrixPeriod==='all';
  const selected=combined?periods:[matrixPeriod];
  const {rows,subjects}=matrixData(records,selected);
  if (!rows.length) {
    parent.append(element('p','No se han importado calificaciones para '+labels[matrixPeriod]+' en este curso y grupo.'));
    return;
  }
  const availablePeriods=selected.filter(period=>records.some(record=>record.period===period));
  if(combined && !availablePeriods.includes(matrixSortPeriod)) matrixSortPeriod=availablePeriods.at(-1);
  const orderPeriod=combined?matrixSortPeriod:matrixPeriod;
  const controls=element('div',undefined,'filters matrix-sort');
  controls.setAttribute('role','group');
  controls.setAttribute('aria-label','Ordenar la tabla de notas');
  if(combined) {
    const label=element('label','Evaluación para ordenar');
    const select=element('select');
    select.id='matrix-sort-period';
    for(const period of availablePeriods)select.append(new Option(labels[period],period));
    select.value=matrixSortPeriod;
    select.onchange=()=>{
      matrixSortPeriod=select.value;
      showGradesTable(records);
      $('matrix-sort-period').focus();
    };
    label.append(select);
    controls.append(label);
  }
  for(const [sort,{label}] of Object.entries(matrixSorts)) {
    const button=element('button',label);
    button.dataset.matrixSort=sort;
    button.setAttribute('aria-pressed',String(matrixSort===sort));
    if(matrixSort===sort)button.classList.add('primary');
    button.onclick=()=>{
      matrixSort=matrixSort===sort?'':sort;
      showGradesTable(records);
      parent.querySelector('[data-matrix-sort="'+sort+'"]').focus();
    };
    controls.append(button);
  }
  parent.append(controls);
  const pupilStats=new Map(rows.map(row=>[row,new Map(selected.map(period=>[
    period,statistics(Object.values(row.terms.get(period)||{}))
  ]))]));
  const ordering=matrixSorts[matrixSort];
  if(ordering) {
    rows.sort((a,b)=>{
      const left=pupilStats.get(a).get(orderPeriod);
      const right=pupilStats.get(b).get(orderPeriod);
      if(!left.n)return right.n?1:0;
      if(!right.n)return -1;
      return (left[ordering.metric]-right[ordering.metric])*ordering.direction;
    });
  }
  const ariaSort=ordering?.direction===1?'ascending':'descending';
  const groups=[
    {label:'Suspensos',metric:'fail'},
    {label:'Media',metric:'mean'},
    ...subjects.map(subject=>{
      const name=key(subject);
      const label=name==='physical education'?'PE':name==='lengua castellana y literatura'?'Lengua':subject;
      return {label,subject};
    })
  ];
  const grid=element('table',undefined,'grade-matrix'+(combined?' grade-matrix-combined':''));
  const head=element('thead'), first=element('tr'), second=element('tr');
  const pupil=element('th','Alumno/a');
  pupil.scope='col';pupil.rowSpan=combined?2:1;
  first.append(pupil);
  for (const group of groups) {
    const label=element('th',group.label,'matrix-start');
    label.scope=combined?'colgroup':'col';
    if(!combined&&ordering&&group.metric===ordering.metric)label.setAttribute('aria-sort',ariaSort);
    label.colSpan=selected.length;
    first.append(label);
    selected.forEach((period,i)=>{
      const cell=element('th',matrixPeriods[period],i===0?'matrix-start':'');
      cell.scope='col';
      if(combined&&ordering&&group.metric===ordering.metric&&period===orderPeriod)cell.setAttribute('aria-sort',ariaSort);
      second.append(cell);
    });
  }
  head.append(first);
  if (combined) head.append(second);
  const body=element('tbody');
  const footer=element('tfoot');
  const byPeriod=new Map(selected.map(period=>[period,rows.flatMap(row=>row.terms.has(period)?[row.terms.get(period)]:[])]));
  const cohortStats = new Map(groups.map(group=>[group,new Map(selected.map(period=>[
    period,statistics(byPeriod.get(period).flatMap(grades=>group.subject===undefined?Object.values(grades):[grades[group.subject]]))
  ]))]));
  for (const row of rows) {
    const tr=element('tr');
    const label=element('th',row.name);label.scope='row';
    if (!$('group').value) label.append(element('small','Grupo '+row.group,'muted'));
    tr.append(label);
    for (const group of groups) selected.forEach((period,i)=>{
      const stats=pupilStats.get(row).get(period);
      const value=group.metric ? (stats.n?stats[group.metric]:null) : row.terms.get(period)?.[group.subject]??null;
      const cell=element('td',fmtValue(value),i===0?'matrix-start':'');
      if (group.subject!==undefined && value!==null) {
        cell.classList.add(value<5?'grade-insufficient':'grade-pass');
        if (value>=5) cell.dataset.gradeBand=String(Math.floor(value));
      }
      tr.append(cell);
    });
    body.append(tr);
  }
  for (const [label,metric] of [['Media de las notas','mean'],['N.º de suspensos','fail'],['Notas válidas','n']]) {
    const tr=element('tr');
    const cell=element('th',label);cell.scope='row';tr.append(cell);
    for (const group of groups) selected.forEach((period,i)=>{
      const stats=cohortStats.get(group).get(period);
      const show=group.subject!==undefined || group.metric===metric || (group.metric==='mean'&&metric==='n');
      tr.append(element('td',show&&stats.n?fmtValue(stats[metric]):'—',i===0?'matrix-start':''));
    });
    footer.append(tr);
  }
  grid.append(head,body,footer);
  const scroll=element('div',undefined,'scroll matrix-scroll');
  scroll.tabIndex=0;
  scroll.setAttribute('role','region');
  scroll.setAttribute('aria-label',combined?'Tabla de notas de todas las evaluaciones':'Tabla de notas del '+labels[matrixPeriod]);
  scroll.append(grid);
  parent.append(element('p','Las notas inferiores a 5 se resaltan en granate. La raya indica que no hay nota registrada.','muted'),scroll);
}
function graph(parent,title,items) {
  const legend=element('p',undefined,'chart-key');
  for (const [label,cls] of [['Aprobadas','pass'],['Suspensas','fail']]) {
    const item=element('span');item.append(element('i',undefined,cls),label);legend.append(item);
  }
  parent.append(element('h3',title),legend);
  for(const {label,stats} of items) {
    const row=element('div',undefined,'chart-row'), track=element('div',undefined,'track');
    track.setAttribute('aria-hidden','true');
    if(stats.n){
      const pass=element('span',undefined,'bar'), fail=element('span',undefined,'bar fail');
      pass.style.width=stats.rate+'%';fail.style.width=(100-stats.rate)+'%';
      track.append(pass,fail);
    }
    row.append(element('span',label),track,element('span',stats.n?fmt.format(stats.rate)+' % aprobadas':'Sin notas'));
    parent.append(row);
  }
}
function table(parent,heading,head,rows) {
  if(heading)parent.append(element('h3',heading));
  const wrap=element('div',undefined,'scroll'), table=element('table'), titles=element('thead'), headers=element('tr'), body=element('tbody');
  for(const label of head){const th=element('th',label);th.scope='col';headers.append(th);}
  titles.append(headers);table.append(titles,body);
  for(const row of rows){
    const tr=element('tr');tr.append(...row.map(cell=>element('td',cell)));body.append(tr);
  }
  wrap.append(table);parent.append(wrap);
}
function printButton(parent,report) {
  activeReport=report;
  const button=element('button','Descargar PDF');
  button.onclick=()=>run(()=>downloadPdf(activeReport));
  parent.append(button);
}
const gradesOf = (records,subject) => records.flatMap(record=>record.students.flatMap(student=>subject?
  (haveOwn(student.grades,subject)?[student.grades[subject]]:[]):Object.values(student.grades)));
const columns = ['Selección','Notas','Media','Aprobadas','Suspensas','% aprobadas'];
const rowOf = ({label,stats})=>[label,stats.n,fmtValue(stats.mean),stats.pass,stats.fail,fmtValue(stats.rate)];
function empty(parent) {
  const button=element('button','Importar Excel','primary');
  button.onclick=()=>changeView('import');
  parent.append(element('h2','Aún no hay calificaciones'),element('p','Importa el informe de evaluación para ver las materias y su evolución.'),button);
}
function showResults(records,current) {
  const parent=$('content');
  parent.replaceChildren();
  if(!current.length){empty(parent);return;}
  const subject=$('subject').value;
  const title=subject||'Resumen del curso';
  const context=[$('year').value,$('course').value,$('group').value?'Grupo '+$('group').value:'Todos los grupos',labels[$('period').value]].join(' · ');
  const stats=statistics(gradesOf(current,subject));
  const courses=subject?distinct(current.map(record=>record.group)).map(group=>({label:'Grupo '+group,stats:statistics(gradesOf(current.filter(record=>record.group===group),subject))})):
    distinct(current.flatMap(record=>record.subjects)).map(label=>({label,stats:statistics(gradesOf(current,label))}));
  const evolution=periods.map(period=>({label:labels[period],stats:statistics(gradesOf(records.filter(record=>record.period===period),subject))}));
  const present=evolution.filter(item=>item.stats.n);
  const heading=element('div',undefined,'filters');
  heading.append(element('h2',title));
  parent.append(heading,element('p',context,'muted'));
  const cards=element('div',undefined,'stats');
  for(const [label,value] of [['Nota media',fmtValue(stats.mean)],['Notas contabilizadas',stats.n],['Aprobadas',stats.pass],['Suspensas',stats.fail]]){
    const card=element('div',undefined,'stat');card.append(element('strong',value),element('span',label));cards.append(card);
  }
  parent.append(cards,element('p','Aprobado a partir de 5 sobre 10. Un 0 registrado se contabiliza. Las celdas sin nota se excluyen.','muted'));
  graph(parent,subject?'Aprobados y suspensos por grupo':'Aprobados y suspensos por materia',courses);
  graph(parent,'Evolución por evaluación',evolution);
  const reading=[];
  if(present.length>1){
    const first=present[0],last=present.at(-1),delta=last.stats.mean-first.stats.mean;
    reading.push('La media pasó de '+fmt.format(first.stats.mean)+' en '+first.label+' a '+fmt.format(last.stats.mean)+' en '+last.label+' (variación: '+(delta>0?'+':'')+fmt.format(delta)+' puntos).');
  }else if(present.length===1)reading.push('Hay una evaluación con notas para esta selección. Al añadir otro trimestre podrás comparar la evolución.');
  const withGrades=courses.filter(item=>item.stats.n);
  if(withGrades.length) {
    const highest=Math.max(...withGrades.map(item=>item.stats.rate)), lowest=Math.min(...withGrades.map(item=>item.stats.rate));
    if(highest!==lowest){
      reading.push('Mayor porcentaje de aprobados: '+withGrades.filter(item=>item.stats.rate===highest).map(item=>item.label).join(', ')+' ('+fmt.format(highest)+' %).');
      reading.push('Conviene revisar '+withGrades.filter(item=>item.stats.rate===lowest).map(item=>item.label).join(', ')+', con el porcentaje de aprobados más bajo de esta selección ('+fmt.format(lowest)+' %).');
    }
  }
  if(reading.length)parent.append(element('h3','Lectura de resultados'),...reading.map(line=>element('p',line)));
  table(parent,'Detalle de la evaluación',columns,courses.map(rowOf));
  table(parent,'Comparación entre evaluaciones',columns,evolution.map(rowOf));
  printButton(heading,{title,context,sections:[{title:'Resultados de la evaluación',items:courses},{title:'Evolución por evaluación',items:evolution}],notes:reading});
}
function openDopStudent(record,name) {
  const original={...record,course:record.originalCourse};
  $('year').value=original.year;
  const courses=state.records.filter(item=>item.year===original.year);
  setOptions('course',distinct(courses.map(item=>item.course)));
  $('course').value=original.course;
  const records=courses.filter(item=>item.course===original.course);
  setOptions('group',distinct(records.map(item=>item.group)));
  $('group').value=original.group;
  setOptions('period',[[original.period,labels[original.period]]]);
  studentKey=studentId(original,name);
  changeView('students');
}
function showStudents(records,current,focusDirection) {
  const parent=$('content');
  parent.replaceChildren();
  if(!current.length){empty(parent);return;}
  const students=current.flatMap(record=>record.students.map(student=>({id:studentId(record,student.name),record,student})));
  if(!students.length){empty(parent);return;}
  students.sort((a,b)=>a.student.name.localeCompare(b.student.name,'es'));
  const control=element('label','Alumno o alumna');
  control.htmlFor='student-select';
  const picker=element('div',undefined,'student-picker');
  const select=element('select');
  select.id='student-select';
  for(const item of students) select.append(new Option(item.student.name+' · '+item.record.group,item.id));
  if(students.some(item=>item.id===studentKey))select.value=studentKey;
  studentKey=select.value;
  select.onchange=()=>{studentKey=select.value;showStudents(records,current);};
  picker.append(select);
  let navigationFocus;
  for (const [direction,arrow,label] of [[-1,'←','Alumno anterior'],[1,'→','Alumno siguiente']]) {
    const button=element('button',arrow,'student-step primary');
    button.type='button';
    button.setAttribute('aria-label',label);
    button.title=label;
    const target=students[select.selectedIndex+direction];
    button.disabled=!target;
    button.onclick=()=>{
      studentKey=target.id;
      showStudents(records,current,direction);
    };
    if (focusDirection===direction && target) navigationFocus=button;
    picker.append(button);
  }
  parent.append(control,picker);
  const selected=students.find(item=>item.id===studentKey);
  const {student,record}=selected;
  const groupRecords=records.filter(item=>key(item.group)===key(record.group));
  const entries=periods.map(period=>{
    const other=groupRecords.find(item=>item.period===period);
    return {period,student:other?.students.find(item=>key(item.name)===key(student.name))};
  });
  const evolution=entries.map(({period,student:item})=>({label:labels[period],stats:statistics(Object.values(item?.grades||{}))}));
  const subjects=distinct(entries.flatMap(entry=>Object.keys(entry.student?.grades||{})));
  const rows=subjects.map(subject=>[subject,...entries.map(entry=>fmtValue(entry.student?.grades[subject]??null))]);
  const context=record.year+' · '+record.course+' · Grupo '+record.group+' · '+labels[record.period];
  const heading=element('div',undefined,'filters');heading.append(element('h2',student.name));parent.append(heading,element('p',context,'muted'));
  graph(parent,'Evolución de aprobados y suspensos',evolution);
  table(parent,'Resumen individual',columns,evolution.map(rowOf));
  const headers=['Materia',...periods.map(period=>labels[period])];
  table(parent,'Notas por materia',headers,rows);
  const noteLabel=element('label','Observaciones de tutoría');
  const textarea=element('textarea');
  textarea.value=state.notes[studentKey]||'';
  noteLabel.append(textarea);
  const save=element('button','Guardar observaciones');
  const id=studentKey;
  save.onclick=()=>run(()=>{
    persist(state.records,{...state.notes,[id]:textarea.value});
    message('Observaciones guardadas.');
  });
  parent.append(noteLabel,save);
  printButton(heading,{title:student.name,context,sections:[{title:'Evolución individual',items:evolution}],table:{headers,rows},notes:[],getObservation:()=>textarea.value});
  if (focusDirection) (navigationFocus||select).focus();
}
function downloadPdf(report) {
  if(!report)return;
  const doc=new jspdf.jsPDF();
  let y=18;
  const reserve=height=>{if(y+height>280){doc.addPage();y=18;}};
  function line(value,size=10,bold=false) {
    doc.setFont('helvetica',bold?'bold':'normal');
    doc.setFontSize(size);
    for(const text of doc.splitTextToSize(String(value),178)){reserve(7);doc.text(text,16,y);y+=size*.42+1;}
  }
  line(report.title,17,true);
  line(report.context);
  for(const section of report.sections){
    y+=5;line(section.title,12,true);
    for(const {label,stats} of section.items){
      reserve(20);
      line(label,10,true);
      if(!stats.n){line('Sin notas');continue;}
      line(stats.n+' notas · Media '+fmt.format(stats.mean)+' · '+stats.pass+' aprobadas · '+stats.fail+' suspensas · '+fmt.format(stats.rate)+' % de aprobados',9);
      doc.setFillColor('#c68c0a');doc.rect(16,y,178*stats.rate/100,2.5,'F');
      doc.setFillColor('#a74616');doc.rect(16+178*stats.rate/100,y,178*(100-stats.rate)/100,2.5,'F');
      y+=8;
    }
  }
  if(report.table){
    y+=4;line('Notas por materia',12,true);line(report.table.headers.join(' | '),9,true);
    for(const row of report.table.rows)line(row.join(' | '),9);
  }
  if(report.notes.length){y+=4;line('Lectura de resultados',12,true);for(const note of report.notes)line(note);}
  if(report.getObservation?.().trim()){y+=4;line('Observaciones de tutoría',12,true);line(report.getObservation());}
  doc.save('calificaciones.pdf');
}
function clearImportedGrades() {
  if(!state.records.length)return;
  if(!window.confirm('¿Borrar todas las evaluaciones importadas en este navegador? Puedes usar «Descargar copia del histórico» antes de borrar. Las observaciones y los textos de las actas se conservarán.'))return;
  persist([],state.notes);
  draft=undefined;
  studentKey='';
  activeReport=undefined;
  activeActaPeriod=undefined;
  matrixPeriod=undefined;
  matrixSortPeriod=undefined;
  matrixSort='';
  $('file').value='';
  $('review').hidden=true;
  $('content').replaceChildren();
  showHistory();
  message('Se han borrado las evaluaciones importadas. Ya puedes cargar las del nuevo curso.');
}
function downloadBackup() {
  if(!state.records.length&&!Object.keys(state.notes).length&&!Object.keys(state.actas||{}).length)throw Error('No hay datos guardados.');
  const blob=new Blob([JSON.stringify(state)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=element('a');
  link.href=url;link.download='calificaciones-historico.json';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function restore(event) {
  const input=event.target;
  const file=input.files[0];
  if(!file)return;
  const backup=JSON.parse(await file.text());
  if(!validState(backup))throw Error('El archivo no es una copia de este panel.');
  const present=new Set(state.records.map(recordKey));
  const newRecords=backup.records.filter(record=>{
    const id=recordKey(record);
    if(present.has(id)) return false;
    present.add(id);return true;
  });
  persist([...state.records,...newRecords],{...backup.notes,...state.notes},{...backup.actas,...state.actas});
  input.value='';showHistory();
  message(newRecords.length+' evaluaciones añadidas al histórico.');
}
const actaDraftKey = (year,course,group,period) => JSON.stringify([year,key(course),key(group),period]);
function showActa(records) {
  const content=$('content');
  content.replaceChildren();
  if(!records.length){empty(content);return;}
  if(!$('group').value){
    content.append(element('h2','Acta de evaluación'),element('p','Selecciona un grupo para preparar su acta.'));
    return;
  }
  const year=$('year').value,course=$('course').value,group=$('group').value;
  const tutorKey=actaDraftKey(year,course,group,'tutor');
  const summaries=Object.fromEntries(periods.map(period=>[period,ActaModel.summarize(records.find(item=>item.period===period))]));
  const pages=periods.map(period=>{
    const summary=summaries[period];
    const interpretation=ActaModel.interpretation(summary);
    const draftKey=actaDraftKey(year,course,group,period);
    const draft=state.actas?.[draftKey] || {};
    const notesBySection={2:interpretation.global,3:summary?.failures.length?[]:[
      summary?.evaluated?'No se registran insuficientes en las notas válidas.':'Faltan calificaciones para completar la relación.'
    ],5:interpretation.observations,7:interpretation.measures};
    const sections=Object.entries(ActaModel.sections).map(([number,title])=>({
      number:Number(number),title,lines:notesBySection[number]||[],note:draft[number]||'',editable:number!=='3'
    }));
    return {period,label:labels[period],summary,draftKey,sections};
  });
  const tutor=document.createElement('input');
  tutor.value=state.actas?.[tutorKey]?.name ?? (records.find(item=>item.tutor)?.tutor || '');
  const data={year,course,group,get tutor(){return tutor.value.trim();},pages,table:ActaModel.groupsTable(summaries,periods)};
  if(!activeActaPeriod) activeActaPeriod=records[0].period;
  const page=pages.find(item=>item.period===activeActaPeriod);
  const actions=element('div',undefined,'filters acta-actions');
  const wordButton=element('button','Descargar acta completa en Word');
  wordButton.onclick=()=>run(()=>ActaExport.word(data));
  const pdfButton=element('button','Descargar PDF · '+page.label,'primary');
  pdfButton.onclick=()=>run(()=>ActaExport.pdf(data,page));
  actions.append(pdfButton,wordButton);
  const tabs=element('div',undefined,'filters acta-tabs');
  tabs.setAttribute('role','group');
  tabs.setAttribute('aria-label','Páginas del acta');
  for(const term of pages){
    const button=element('button',term.label);
    button.setAttribute('aria-pressed',String(term===page));
    if(term===page)button.classList.add('primary');
    button.onclick=()=>{activeActaPeriod=term.period;showActa(records);};
    tabs.append(button);
  }
  const paper=element('article',undefined,'acta-paper');
  const header=element('div',undefined,'acta-header');
  const image=element('img');image.src='./julio-verne-school.png';image.alt='Julio Verne School';image.width=46;image.height=56;
  const title=element('div');title.append(element('h2','Acta de sesión de evaluación'),element('p','PC 04 · Edición 2','muted'));
  header.append(image,title);
  const metadata=element('div',undefined,'filters');
  const tutorLabel=element('label','Tutor/a');tutorLabel.append(tutor);
  tutor.onchange=()=>saveActaField(tutorKey,'name',tutor.value);
  metadata.append(element('p','Curso '+year+' · '+course+' · Grupo '+group+' · '+page.label),tutorLabel);
  paper.append(header,metadata);
  const section1=element('div',undefined,'acta-section');
  section1.append(element('h3','1. Resultados del grupo'));
  table(section1,'',['Indicador',...ActaExport.termNames.flatMap(label=>[label+' Nº',label+' %'])],data.table);
  section1.append(element('p',ActaModel.tableNote,'muted'));
  if(page.summary?.roster){
    const items=ActaExport.chartData(page.summary);
    const track=element('div',undefined,'track acta-track');
    track.setAttribute('role','img');track.setAttribute('aria-label',ActaExport.chartLabel(page.summary));
    for(const item of items){
      const bar=element('span',undefined,'bar');
      bar.style.width=(100*item.count/page.summary.roster)+'%';bar.style.background=item.color;
      track.append(bar);
    }
    const legend=element('p',undefined,'chart-key');
    for(const item of items){
      const key=element('span'),swatch=element('i');
      swatch.style.background=item.color;key.append(swatch,item.name+' ('+item.count+')');legend.append(key);
    }
    section1.append(element('h4','Distribución del rendimiento'),track,legend);
  }
  paper.append(section1);
  const prompts={2:'Causas o contexto observado',4:'Información trasladada por gabinete',5:'Aportación del tutor',6:'Aportaciones del profesorado',7:'Otras medidas acordadas',8:'Convivencia, faltas, sanciones y propuestas'};
  for(const item of page.sections){
    const block=element('div',undefined,'acta-section');
    block.append(element('h3',item.number+'. '+item.title));
    const instruction=ActaModel.instructions[item.number];
    if(instruction)block.append(element('p',instruction,'muted'));
    if(item.number===3 && page.summary?.failures.length) table(block,'',ActaExport.failureHeaders,ActaExport.failures(page));
    block.append(...item.lines.map(text=>element('p',text)));
    if(item.editable){
      const label=element('label',prompts[item.number]);
      const input=element('textarea');
      input.value=item.note;
      input.oninput=()=>{item.note=input.value;};
      input.onchange=()=>saveActaField(page.draftKey,String(item.number),input.value);
      label.append(input);block.append(label);
    }
    paper.append(block);
  }
  content.append(tabs,actions,paper);
}
function saveActaField(draftKey,field,value) {
  try {
    const previous=state.actas||{};
    persist(state.records,state.notes,{...previous,[draftKey]:{...previous[draftKey],[field]:value}});
  } catch (error) {
    message(error?.name==='QuotaExceededError'?'El navegador se ha quedado sin espacio para guardar el acta.':error.message,true);
  }
}
async function run(action) {
  try {message();await action();}
  catch(error){message(error?.name==='QuotaExceededError'?'No queda espacio para guardar más evaluaciones en este navegador.':error.message,true);}
}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>changeView(button.dataset.view);
for(const id of ['year','course','group','period','subject'])$(id).onchange=refreshFilters;
$('file').onchange=event=>run(()=>readFile(event));
$('save').onclick=()=>run(saveImport);
$('export').onclick=()=>run(downloadBackup);
$('clear-imports').onclick=()=>run(clearImportedGrades);
$('restore').onchange=event=>run(()=>restore(event));
try {
  const stored=JSON.parse(localStorage.getItem(dbKey));
  if(validState(stored))state=stored;
} catch {message('No se pudo recuperar el histórico de este navegador.',true);}
changeView('results');
