'use strict';

const dopDashboard = (() => {
  const stages=['Primaria','ESO','Bachillerato'];
  const planned=stages.flatMap((stage,index)=>Array.from({length:[6,4,2][index]},(_,i)=>({stage,course:(i+1)+'.º '+stage})));
  const words=['primero','segundo','tercero','cuarto','quinto','sexto'];
  const choice={view:'map',stage:'',course:'',group:'',subject:'',period:'',reference:'',metric:'fail'};
  const metricNames={mean:'Nota media',fail:'% de insuficientes',change:'Variación de insuficientes'};
  const isRate=metric=>metric!=='mean';
  const failRate=stats=>stats.n?100*stats.fail/stats.n:null;
  const metricValue=(stats,previous,metric)=>metric==='mean'?stats.mean:metric==='fail'?failRate(stats):stats.n&&previous.n?failRate(stats)-failRate(previous):null;
  const format=(value,metric)=>value==null?'—':(metric==='change'&&value>0?'+':'')+fmt.format(value)+(metric==='change'?' pp':isRate(metric)?' %':'');
  const stageOf=course=>{
    const name=key(course);
    if(/\bprim(?:aria)?\b/.test(name))return 'Primaria';
    if(/\b(?:eso|secundaria)\b/.test(name))return 'ESO';
    if(/\b(?:bac|bachillerato|bach)\b/.test(name))return 'Bachillerato';
    return 'Otros';
  };
  function canonicalCourse(course) {
    const name=key(course), stage=stageOf(course);
    const number=Number(name.match(/^([1-6])/)?.[1]) || words.findIndex(word=>name.startsWith(word))+1;
    return planned.find(item=>item.stage===stage && item.course.startsWith(number+'.'))?.course || course;
  }
  function listOptions(parent,label,options,value,onChange) {
    const wrapper=element('label',label);
    const select=element('select');
    for(const [id,name] of options)select.append(new Option(name,id));
    if(options.some(([id])=>id===value))select.value=value;
    select.onchange=()=>onChange(select.value);
    wrapper.append(select);parent.append(wrapper);
    return select.value;
  }
  const forPeriod=(records,period)=>records.filter(record=>record.period===period);
  const itemStats=(records,subject)=>statistics(gradesOf(records,subject));
  const courseKeys=records=>distinct(records.map(record=>record.course+' · '+record.group));
  function coverage(records,current) {
    const expected=courseKeys(records), present=new Set(courseKeys(current));
    return {expected:expected.length,loaded:present.size,missing:expected.filter(item=>!present.has(item))};
  }
  function formatCoverage(value) {
    return value.loaded+' de '+value.expected+' grupos con archivo en esta evaluación, entre los conocidos en el histórico del año.';
  }
  function issuedStats(records) {
    let evaluated=0,passed=0,failed=0,three=0;
    for(const record of records)for(const student of record.students){
      const stats=statistics(Object.values(student.grades));
      if(!stats.n)continue;
      evaluated++;
      if(!stats.fail)passed++;
      if(stats.fail)failed++;
      if(stats.fail>=3)three++;
    }
    return {evaluated,passed,failed,three};
  }
  function statsTile(parent,label,value) {
    const tile=element('div',undefined,'stat');tile.append(element('strong',value),element('span',label));parent.append(tile);
  }
  function mainCoverage(parent,loaded,reference) {
    const block=element('details',undefined,'dop-coverage');
    block.append(element('summary','Cobertura de las evaluaciones'));
    for(const [period,data] of [[choice.period,loaded],[choice.reference,reference]]) {
      if(!period)continue;
      block.append(element('p',labels[period]+' · '+formatCoverage(data)));
      if(data.missing.length)block.append(element('p','Pendientes: '+data.missing.join(', ')+'.','muted'));
    }
    parent.append(block);
  }
  const statRow=(label,stats)=>[label,fmtValue(stats.mean),format(failRate(stats),'fail'),stats.n||'—'];
  function lineReading(subject,scopes) {
    const comparable=scopes.filter(([,current,reference])=>current.n&&reference.n);
    if(!comparable.length)return ['Faltan notas comparables entre las evaluaciones seleccionadas.'];
    const weakest=comparable.slice().sort((a,b)=>failRate(b[1])-failRate(a[1]))[0];
    const change=failRate(weakest[1])-failRate(weakest[2]);
    const prefix=subject?subject+' · ':'';
    return [
      prefix+weakest[0]+' tiene el mayor porcentaje de insuficientes entre los ámbitos comparables ('+format(failRate(weakest[1]),'fail')+').',
      (change>0?'Sube ':change<0?'Baja ':'Se mantiene en ') +(change===0?format(failRate(weakest[1]),'fail') : fmt.format(Math.abs(change))+' puntos porcentuales')+' frente a '+labels[choice.reference]+'.',
      weakest[1].fail?'Revisa el desglose de ese ámbito y el número de notas válidas antes de decidir una actuación.':'Mantén el seguimiento en la próxima evaluación.'
    ];
  }
  function tint(cell,value,metric) {
    if(value==null || metric==='change'&&value===0)return;
    const ratio=metric==='mean'?value/10:Math.abs(value)/100;
    const positive=metric==='mean'||(metric==='change'&&value<0);
    cell.style.backgroundColor=(positive?'rgba(198,140,10,':'rgba(143,18,44,')+(0.06+0.27*ratio)+')';
  }
  function mapView(parent,scope,current,previous,rerender) {
    const offered=new Set(scope.flatMap(record=>record.subjects));
    const subjects=distinct([...offered]);
    const columns=choice.course?[choice.course]:[
      ...planned.filter(item=>!choice.stage||item.stage===choice.stage).map(item=>item.course),
      ...distinct(scope.map(record=>record.course)).filter(course=>!planned.some(item=>item.course===course))
    ];
    const groups=columns.map(course=>({
      label:course,known:scope.filter(record=>record.course===course),current:current.filter(record=>record.course===course),
      previous:previous.filter(record=>record.course===course)
    }));
    groups.unshift({label:choice.course||choice.stage?'Total de la selección':'Todo el centro',known:scope,current,previous});
    const grid=element('table',undefined,'grade-matrix dop-map');
    const thead=element('thead'), tr=element('tr');
    for(const title of ['Materia',...groups.map(group=>group.label)])tr.append(element('th',title));
    thead.append(tr);
    const body=element('tbody');
    const candidates=[];
    const pdfRows=[];
    for(const subject of subjects){
      const row=element('tr'),name=element('th',subject);name.scope='row';row.append(name);
      const pdfRow=[subject];
      for(const group of groups){
        const now=itemStats(group.current,subject),then=itemStats(group.previous,subject);
        const value=metricValue(now,then,choice.metric);
        const offeredHere=group.known.some(record=>record.subjects.includes(subject));
        const status=!group.current.length?'Sin archivos':!offeredHere?'Sin oferta registrada':!now.n?'Sin notas':!then.n&&choice.metric==='change'?'Sin comparación':'';
        const cell=element('td');
        if(value==null)cell.append(element('span',status,'muted'));
        else {
          const button=element('button',format(value,choice.metric),'dop-cell');
          button.title=group.label+' · '+subject+' · '+now.n+' notas válidas';
          button.onclick=()=>{
            choice.view='subject';choice.subject=subject;
            if(groups[0]!==group){choice.course=group.label;choice.stage=stageOf(group.label);}
            rerender();
          };
          cell.append(button,element('small',now.n+' notas','muted'));
          tint(cell,value,choice.metric);
          if(groups[0]!==group)candidates.push({subject,course:group.label,value,n:now.n});
        }
        row.append(cell);
        pdfRow.push(value==null?status:format(value,choice.metric)+' · '+now.n+' notas');
      }
      body.append(row);
      pdfRows.push(pdfRow);
    }
    grid.append(thead,body);
    const wrap=element('div',undefined,'scroll matrix-scroll');wrap.tabIndex=0;wrap.setAttribute('aria-label','Mapa de resultados por materia y curso');wrap.append(grid);parent.append(wrap);
    const notes=[];
    if(candidates.length){
      const item=candidates.sort((a,b)=>choice.metric==='mean'?a.value-b.value:b.value-a.value)[0];
      const label={mean:'Media más baja',fail:'Mayor porcentaje de insuficientes',change:'Mayor variación del porcentaje de insuficientes'}[choice.metric];
      notes.push(label+': '+item.subject+' · '+item.course+' · '+format(item.value,choice.metric)+' ('+item.n+' notas válidas).');
      notes.push('Abre el resultado para ver sus evaluaciones y comprobar qué grupos aportaron datos.');
    }
    return {headers:['Materia',...groups.map(group=>group.label)],rows:pdfRows,notes};
  }
  function breakdown(scope) {
    if(choice.group)return [[choice.course+' · Grupo '+choice.group,scope]];
    if(choice.course)return [['Total de '+choice.course,scope],...distinct(scope.map(record=>record.group)).map(group=>['Grupo '+group,scope.filter(record=>record.group===group)])];
    if(choice.stage)return [['Total de '+choice.stage,scope],...distinct(scope.map(record=>record.course)).map(course=>[course,scope.filter(record=>record.course===course)])];
    return [['Todo el centro',scope],...stages.map(stage=>[stage,scope.filter(record=>stageOf(record.course)===stage)])];
  }
  function subjectView(parent,scope) {
    const sections=breakdown(scope).filter(([,records])=>records.length);
    const chart=element('div',undefined,'dop-evolution');
    const series=sections.map(([label,records])=>({label,points:periods.map(period=>itemStats(forPeriod(records,period),choice.subject))}));
    gradesCharts.line(chart,'Evolución de '+(choice.subject||'todas las materias'),series);
    parent.append(chart);
    const headers=['Ámbito','Evaluación','Media','% IN','Notas válidas'];
    const rows=series.flatMap(({label,points})=>points.map((stats,i)=>[label,labels[periods[i]],...statRow('',stats).slice(1)]));
    const scopes=sections.slice(sections.length>1?1:0).map(([label,records])=>[label,itemStats(forPeriod(records,choice.period),choice.subject),itemStats(forPeriod(records,choice.reference),choice.subject)]);
    return {headers,rows,notes:lineReading(choice.subject,scopes),series};
  }
  function groupsView(parent,scope) {
    const groups=breakdown(scope);
    const headers=['Ámbito','Materia','Media','% IN','Notas','Media de referencia','% IN de referencia','Variación de IN'];
    const rows=[];
    for(const [label,records] of groups) {
      const subjects=choice.subject?[choice.subject]:['',...distinct(records.flatMap(record=>record.subjects))];
      for(const subject of subjects){
        const now=itemStats(forPeriod(records,choice.period),subject);
        const then=itemStats(forPeriod(records,choice.reference),subject);
        const delta=metricValue(now,then,'change');
        rows.push([label,subject||'Todas',fmtValue(now.mean),format(failRate(now),'fail'),String(now.n||'—'),fmtValue(then.mean),format(failRate(then),'fail'),format(delta,'change')]);
      }
    }
    table(parent,'Comparación de ámbitos y materias',headers,rows);
    const scopes=groups.slice(groups.length>1?1:0).map(([label,records])=>[label,itemStats(forPeriod(records,choice.period),choice.subject),itemStats(forPeriod(records,choice.reference),choice.subject)]);
    return {headers,rows,notes:lineReading(choice.subject,scopes)};
  }
  function exportPdf(report) {
    const doc=new jspdf.jsPDF({orientation:'landscape'});
    let y=15;
    function text(value,size=9,bold=false) {
      doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
      for(const line of doc.splitTextToSize(String(value),265)){
        if(y>193){doc.addPage();y=15;}
        doc.text(line,15,y);y+=size*.41+1;
      }
    }
    text('DOP · '+report.title,17,true);
    text(report.context);
    text(report.coverage);
    if(report.stats.n){
      const {stats}=report;
      text('Media '+fmtValue(stats.mean)+' · '+format(failRate(stats),'fail')+' de insuficientes · '+stats.n+' calificaciones válidas',10,true);
      doc.setFillColor('#c68c0a');doc.rect(15,y,175*stats.rate/100,3,'F');
      doc.setFillColor('#8f122c');doc.rect(15+175*stats.rate/100,y,175*(100-stats.rate)/100,3,'F');
      y+=8;
    }
    if(report.series?.length){
      y+=5;
      const baseline=y+43;
      const x=i=>38+i*66;
      const lineY=value=>baseline-value*3.7;
      const colors=['#8f122c','#9b6800','#76506f','#a74616','#584843'];
      doc.setFontSize(8);
      for(const tick of [0,5,10]){
        doc.setDrawColor('#dbc4cc');doc.line(30,lineY(tick),250,lineY(tick));
        doc.text(String(tick),20,lineY(tick)+1);
      }
      periods.forEach((period,i)=>doc.text(labels[period],x(i),baseline+6,{align:'center'}));
      report.series.forEach(({points},index)=>{
        const color=colors[index%colors.length];
        doc.setDrawColor(color);doc.setFillColor(color);
        points.forEach(({mean},i)=>{
          if(mean===null)return;
          if(points[i-1]?.mean!=null)doc.line(x(i-1),lineY(points[i-1].mean),x(i),lineY(mean));
          doc.circle(x(i),lineY(mean),1.2,'F');
        });
      });
      y=baseline+13;
      report.series.forEach(({label},index)=>{
        doc.setTextColor(colors[index%colors.length]);text(label,8);
      });
      doc.setTextColor('#23171b');
    }
    for(const note of report.notes)text(note);
    const {headers,rows}=report;
    for(let start=1;start<headers.length;start+=5) {
      const indexes=[0,...headers.slice(start,start+5).map((_,index)=>start+index)];
      const widths=[55,...indexes.slice(1).map(()=>210/(indexes.length-1))];
      function row(values,header=false) {
        doc.setFont('helvetica',header?'bold':'normal');doc.setFontSize(8);
        const lines=indexes.map((index,i)=>doc.splitTextToSize(String(values[index]??'—'),widths[i]-4));
        const height=4+Math.max(...lines.map(cell=>cell.length))*3.6;
        if(y+height>196){doc.addPage();y=15;if(!header)row(headers,true);}
        if(header){doc.setFillColor('#f2e1e6');doc.rect(15,y-3,265,height,'F');}
        let x=15;
        lines.forEach((cell,index)=>{doc.text(cell,x+2,y,{lineHeightFactor:1.15});x+=widths[index];});
        doc.setDrawColor('#dbc4cc');doc.line(15,y+height-3,280,y+height-3);
        y+=height;
      }
      y+=8;row(headers,true);
      for(const item of rows)row(item);
    }
    doc.save('dop-resultados.pdf');
  }
  const transitions=[[1,2],[5,6],[7,8],[9,10],[10,11]].map(pair=>pair.map(index=>planned[index].course));
  const comparisonTypes={
    levels:'Entre niveles, mismo año',
    cohort:'Misma promoción, dos años',
    annual:'Mismo nivel, distintos años'
  };
  const historyChoice={type:'levels',transition:1,course:'',group:'',paired:false};
  const shiftYear=(year,offset)=>{
    const start=Number(year.slice(0,4))+offset;
    return start+'–'+String(start+1).slice(-2);
  };
  function uniqueStudents(records) {
    const byName=new Map();
    for(const record of records)for(const student of record.students){
      const name=key(student.name).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
      if(name)byName.set(name,byName.has(name)?null:student);
    }
    return byName;
  }
  function historyView(parent,records,year,rerender) {
    const controls=element('div',undefined,'filters');
    const update=(field,value)=>{
      historyChoice[field]=value;
      if(['type','transition','course'].includes(field))historyChoice.group='';
      rerender();
    };
    const select=(label,options,value,onchange)=>listOptions(controls,label,options,value,onchange);
    const type=historyChoice.type;
    select('Comparación',Object.entries(comparisonTypes),type,value=>update('type',value));
    const annual=type==='annual',cohort=type==='cohort';
    if(annual){
      const courseOptions=planned.map(({course})=>[course,course]);
      historyChoice.course=select('Nivel',courseOptions,historyChoice.course||transitions[historyChoice.transition][1],value=>update('course',value));
    }
    const [leftCourse,rightCourse]=annual?[historyChoice.course,historyChoice.course]:transitions[historyChoice.transition];
    const leftYear=annual?shiftYear(year,-1):year, rightYear=cohort?shiftYear(year,1):year;
    const scopes=[[leftCourse,leftYear],[rightCourse,rightYear]];
    const all=scopes.map(([course,academicYear])=>records.filter(record=>record.course===course&&record.year===academicYear));
    const termOptions=periods.map(period=>[period,labels[period]]);
    choice.period=select('Evaluación',termOptions,choice.period||'FINAL',value=>{choice.period=value;rerender();});
    const groups=distinct(all.flatMap(side=>side.map(record=>record.group)));
    historyChoice.group=select('Grupo',['',...groups].map(group=>[group,group?'Grupo '+group:'Todos los grupos']),historyChoice.group,value=>update('group',value));
    const scoped=all.map(side=>side.filter(record=>!historyChoice.group||record.group===historyChoice.group));
    const sides=scoped.map(side=>forPeriod(side,choice.period));
    const subjects=distinct(sides.flatMap(side=>side.flatMap(record=>record.subjects)));
    const offered=distinct(scoped.flatMap(side=>side.flatMap(record=>record.subjects)));
    const selected=select('Materia',['',...distinct([...offered,...(choice.subject?[choice.subject]:[])])].map(subject=>[subject,subject||'Todas las materias']),choice.subject,value=>{choice.subject=value;rerender();});
    if(cohort){
      const label=element('label','Alumnado');
      const input=element('select');
      input.append(new Option('Toda la promoción','all'),new Option('Presente en ambos años','paired'));
      input.value=historyChoice.paired?'paired':'all';
      input.onchange=()=>update('paired',input.value==='paired');
      label.append(input);controls.append(label);
    }
    parent.append(controls);
    if(!annual){
      const buttons=element('div',undefined,'filters matrix-tabs');
      buttons.setAttribute('role','group');
      buttons.setAttribute('aria-label','Transiciones');
      transitions.forEach(([from,to],index)=>{
        const button=element('button',from+' a '+to);
        button.type='button';
        button.setAttribute('aria-pressed',String(index===historyChoice.transition));
        if(index===historyChoice.transition)button.classList.add('primary');
        button.onclick=()=>update('transition',index);
        buttons.append(button);
      });
      parent.append(buttons);
    }
    const headings=scopes.map(([course,academicYear])=>course+' · '+academicYear);
    const context=headings.join(' frente a ')+' · '+labels[choice.period]+(historyChoice.group?' · Grupo '+historyChoice.group:'');
    const coverageNotes=sides.map((side,index)=>headings[index]+'. '+(side.length?formatCoverage(coverage(scoped[index],side)):'Falta el archivo de '+labels[choice.period]+' para esta selección.'));
    parent.append(element('h3',context),...coverageNotes.map(note=>element('p',note,'muted')));
    const students=cohort?sides.map(uniqueStudents):[];
    const pairs=cohort?[...students[0]].filter(([name,student])=>student&&students[1].get(name)).map(([name,student])=>[student,students[1].get(name)]):[];
    const paired=cohort&&historyChoice.paired;
    if(cohort&&sides.every(side=>side.length)){
      parent.append(element('p',pairs.length+' coincidencias únicas por nombre completo. Las coincidencias ambiguas quedan fuera del seguimiento individual.','muted'));
    }
    const displaySubjects=selected?[selected]:subjects;
    const results=displaySubjects.map(subject=>{
      const validPairs=pairs.filter(pair=>pair.every(student=>Number.isFinite(student.grades[subject])));
      const stats=paired?[0,1].map(index=>statistics(validPairs.map(pair=>pair[index].grades[subject]))):sides.map(side=>itemStats(side,subject));
      const [before,after]=stats;
      const delta=before.n&&after.n?after.mean-before.mean:null;
      return {subject,stats,delta,validPairs};
    });
    if(!results.length){parent.append(element('p','Las materias aparecerán al importar notas de esta evaluación.'));return;}
    const signed=(number,suffix='')=>number===null?'—':(number>0?'+':'')+fmtValue(number)+suffix;
    const headers=['Materia','Media inicial','Media posterior','Diferencia','Suspensos iniciales','Suspensos posteriores','Cambio de suspensos'];
    const failSummary=stats=>stats.n?stats.fail+'/'+stats.n+' ('+format(failRate(stats),'fail')+')':'—';
    function status(subject,index) {
      if(!sides[index].length)return 'Archivo pendiente';
      if(!sides[index].some(record=>record.subjects.includes(subject)))return 'Sin oferta registrada';
      return paired?'Sin pares con nota':'Sin notas válidas';
    }
    const rows=results.map(({subject,stats:[before,after],delta})=>[
      subject,before.n?fmtValue(before.mean):status(subject,0),after.n?fmtValue(after.mean):status(subject,1),signed(delta),
      failSummary(before),failSummary(after),signed(delta===null?null:failRate(after)-failRate(before),' pp')
    ]);
    const chart=element('div',undefined,'dop-history-chart');
    chart.append(element('h3','Medias por materia (0–10)'));
    for(const {subject,stats} of results){
      const figure=element('div',undefined,'dop-history-subject');
      figure.append(element('strong',subject));
      stats.forEach(({mean,n},index)=>{
        const line=element('div',undefined,'dop-history-line');
        line.append(element('span',headings[index]));
        const track=element('div',undefined,'dop-history-track');
        track.setAttribute('aria-hidden','true');
        const bar=element('div',undefined,'dop-history-bar');
        bar.dataset.series=String(index);
        bar.style.width=(n?mean*10:0)+'%';
        track.append(bar);
        line.append(track,element('span',n?fmtValue(mean):status(subject,index)));
        figure.append(line);
      });
      chart.append(figure);
    }
    parent.append(chart);
    table(parent,'Detalle por materia',headers,rows);
    const compared=results.filter(item=>item.delta!==null);
    const notes=[];
    if(compared.length){
      for(const [label,getValue,suffix] of [
        ['Mayor subida de media',item=>item.delta,' puntos'],
        ['Mayor aumento de suspensos',({stats:[before,after]})=>failRate(after)-failRate(before),' pp']
      ]){
        const ranked=compared.map(item=>({subject:item.subject,value:getValue(item)})).sort((a,b)=>b.value-a.value);
        if(ranked[0].value>=0.005)notes.push(label+' en '+ranked[0].subject+' ('+signed(ranked[0].value,suffix)+').');
      }
      const lowest=compared.slice().sort((a,b)=>a.delta-b.delta)[0];
      if(lowest.delta<=-0.005)notes.push('Mayor descenso de media en '+lowest.subject+' ('+signed(lowest.delta,' puntos')+').');
      if(!notes.length)notes.push('Las materias comparables mantienen su media y no aumentan el porcentaje de suspensos.');
    }else notes.push('Aún faltan notas comparables para calcular diferencias.');
    if(type==='cohort'&&!paired)notes.push('La vista de toda la promoción incluye las incorporaciones y salidas de alumnado de cada año.');
    if(selected===''||key(selected).includes('taller')){
      for(const [index,side] of sides.entries()){
        if(!side.some(record=>record.subjects.some(subject=>key(subject).includes('taller de refuerzo'))))continue;
        const options=['Deutsch','Français','Taller de refuerzo'];
        const counts=options.map(subject=>subject+' '+itemStats(side,subject).n);
        notes.push(headings[index]+' · Calificaciones de segunda lengua y refuerzo: '+counts.join(', ')+'.');
      }
    }
    parent.append(element('h3','Lectura de resultados'),...notes.map(note=>element('p',note)));
    if(cohort&&pairs.length){
      const followup=element('details');
      followup.append(element('summary','Seguimiento del alumnado presente en ambos años'));
      const followupRows=[];
      for(const {subject,validPairs} of results)for(const [before,after] of validPairs){
        const first=before.grades[subject],last=after.grades[subject];
        if(first>=5&&last>=5)continue;
        const outcome=first>=5?'Pasa a insuficiente':last>=5?'Se recupera':'Mantiene insuficiente';
        followupRows.push([before.name,subject,fmtValue(first),fmtValue(last),outcome]);
      }
      if(followupRows.length)table(followup,'Cambios respecto al aprobado',['Alumno/a','Materia','Inicial','Posterior','Resultado'],followupRows);
      else followup.append(element('p','Sin suspensos en las notas emparejadas de esta selección.'));
      if(sides[1].some(record=>record.subjects.includes('Taller de refuerzo'))){
        const support=pairs.filter(([,after])=>Number.isFinite(after.grades['Taller de refuerzo']));
        const progress=support.map(([before,after])=>[
          before.name,['Deutsch','Français'].filter(subject=>Number.isFinite(before.grades[subject])).join(' / ')||'Sin nota registrada',
          ...['Lengua Castellana y Literatura','Valencià','Matemáticas'].map(subject=>[before,after].map(student=>fmtValue(student.grades[subject]??null)).join(' → '))
        ]);
        if(progress.length)table(followup,'Seguimiento del Taller de refuerzo',['Alumno/a','Segunda lengua anterior','Lengua','Valencià','Matemáticas'],progress);
      }
      parent.append(followup);
    }
    const button=element('button','Descargar PDF de la selección','primary');
    button.onclick=()=>run(()=>exportPdf({title:comparisonTypes[type],context,coverage:coverageNotes.join(' '),stats:{n:0},notes,headers,rows}));
    parent.append(button);
  }
  const names={map:'Centro de un vistazo',subject:'Seguimiento por materia',groups:'Comparación de cursos y grupos',history:'Transiciones e histórico'};
  return function showDop(records,year) {
    const parent=$('content');
    const history=records.map(record=>({...record,course:canonicalCourse(record.course)}));
    const normalized=history.filter(record=>record.year===year);
    function render(){
      parent.replaceChildren(element('h2','DOP'),element('p',year+' · Resultados académicos del centro','muted'));
      if(!history.length){parent.append(element('p','Importa las evaluaciones de un año académico para consultar el centro.'));return;}
      const update=(name,value)=>{
        choice[name]=value;
        if(name==='stage'){choice.course='';choice.group='';}
        if(name==='course')choice.group='';
        render();
      };
      const tabs=element('div',undefined,'filters matrix-tabs');
      tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Vistas DOP');
      for(const [id,label] of Object.entries(names)){
        const button=element('button',label);
        button.setAttribute('aria-pressed',String(choice.view===id));
        if(choice.view===id)button.classList.add('primary');
        button.onclick=()=>update('view',id);
        tabs.append(button);
      }
      parent.append(tabs);
      if(choice.view==='history'){historyView(parent,history,year,render);return;}
      const controls=element('div',undefined,'filters');
      const options=(items,allLabel)=>[['',allLabel],...items.map(item=>[item,item])];
      const available=periods.filter(period=>forPeriod(normalized,period).length);
      const academicStages=normalized.some(record=>stageOf(record.course)==='Otros')?[...stages,'Otros']:stages;
      choice.stage=listOptions(controls,'Etapa',options(academicStages,'Todas las etapas'),choice.stage,value=>update('stage',value));
      const inStage=normalized.filter(record=>!choice.stage||stageOf(record.course)===choice.stage);
      choice.course=listOptions(controls,'Curso',options(distinct(inStage.map(record=>record.course)),'Todos los cursos'),choice.course,value=>update('course',value));
      const inCourse=inStage.filter(record=>!choice.course||record.course===choice.course);
      choice.group=choice.course?listOptions(controls,'Grupo',options(distinct(inCourse.map(record=>record.group)),'Todos los grupos'),choice.group,value=>update('group',value)):'';
      const scope=inCourse.filter(record=>!choice.group||record.group===choice.group);
      const subjectOptions=options(distinct(scope.flatMap(record=>record.subjects)),'Todas las materias');
      if(choice.view!=='map') choice.subject=listOptions(controls,'Materia',subjectOptions,choice.subject,value=>update('subject',value));
      const termOptions=periods.map(period=>[period,labels[period]+(available.includes(period)?'':' · Sin archivos')]);
      choice.period=listOptions(controls,'Evaluación',termOptions,choice.period||available.at(-1),value=>update('period',value));
      const reference=available.filter(period=>periods.indexOf(period)<periods.indexOf(choice.period)).at(-1) || periods.find(period=>period!==choice.period);
      if(choice.reference===choice.period)choice.reference='';
      choice.reference=listOptions(controls,'Comparar con',termOptions.filter(([period])=>period!==choice.period),choice.reference||reference,value=>update('reference',value));
      if(choice.view==='map')choice.metric=listOptions(controls,'Indicador',Object.entries(metricNames),choice.metric,value=>update('metric',value));
      parent.append(controls);
      const current=forPeriod(scope,choice.period),previous=forPeriod(scope,choice.reference);
      const loaded=coverage(scope,current),referenceLoaded=coverage(scope,previous);
      const pupils=issuedStats(current),summary=itemStats(current,choice.view==='map'?'':choice.subject);
      const tiles=element('div',undefined,'stats');
      statsTile(tiles,'Nota media',fmtValue(summary.mean));
      statsTile(tiles,'Insuficientes',format(failRate(summary),'fail'));
      statsTile(tiles,'Notas válidas',summary.n);
      statsTile(tiles,'Alumnado evaluado',pupils.evaluated);
      statsTile(tiles,'Con todo aprobado',pupils.passed);
      statsTile(tiles,'Con algún IN',pupils.failed);
      statsTile(tiles,'Con 3 o más IN',pupils.three);
      parent.append(tiles,element('p','Las medias se calculan a partir de las notas válidas. Los indicadores de alumnado abarcan todas sus materias.','muted'));
      mainCoverage(parent,loaded,referenceLoaded);
      const unresolved=scope.reduce((sum,record)=>sum+record.languageConflicts.filter(item=>!item.chosen).length,0);
      if(unresolved)parent.append(element('p',unresolved+' calificaciones de materias unificadas están pendientes de revisión en los grupos de esta selección.','muted'));
      const body=element('div',undefined,'dop-detail');
      parent.append(body);
      if(!scope.length){body.append(element('p','No hay archivos para esta selección.'));return;}
      const result=choice.view==='map'?mapView(body,scope,current,previous,render):choice.view==='subject'?subjectView(body,scope):groupsView(body,scope);
      if(result.notes.length)body.append(element('h3','Lectura de resultados'),...result.notes.map(note=>element('p',note)));
      const button=element('button','Descargar PDF de la selección','primary');
      const context=[year,choice.stage||'Todas las etapas',choice.course,choice.group?'Grupo '+choice.group:'',choice.view==='map'?metricNames[choice.metric]:choice.subject,labels[choice.period]+' frente a '+labels[choice.reference]].filter(Boolean).join(' · ');
      button.onclick=()=>run(()=>exportPdf({...result,title:names[choice.view],context,coverage:formatCoverage(loaded),stats:summary}));
      parent.append(button);
    }
    render();
  };
})();
