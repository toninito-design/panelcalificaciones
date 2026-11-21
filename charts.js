'use strict';

const gradesCharts = (() => {
  const palette=['#8f122c','#9b6800','#76506f','#a74616','#584843'];
  const bandNames=['Menos de 5','De 5 a menos de 7','De 7 a menos de 9','De 9 a 10'];
  const types=[['subject','Materia'],['student','Alumno'],['course','Curso o grupo']];
  const selection={type:'subject',subject:'',distribution:'',student:'',studentSubject:'',first:'',second:''};
  const failRate=stats=>stats.n?100*stats.fail/stats.n:null;
  const number=value=>value==null?'—':fmt.format(value);
  const percent=value=>value==null?'—':fmt.format(value)+' %';
  const signed=value=>(value>0?'+':'')+fmt.format(value);
  const selectedRecords=(records,period)=>records.filter(record=>record.period===period);
  const periodStats=(records,subject)=>periods.map(period=>statistics(gradesOf(selectedRecords(records,period),subject)));

  function picker(parent,label,options,value,onChange) {
    const wrapper=element('label',label);
    const select=element('select');
    for(const [id,text] of options)select.append(new Option(text,id));
    if(options.some(([id])=>id===value))select.value=value;
    select.onchange=()=>onChange(select.value);
    wrapper.append(select);
    parent.append(wrapper);
    return select;
  }
  function addPickerArrows(parent,select,previous,next) {
    const buttons=[[-1,'←',previous],[1,'→',next]].map(([step,arrow,label])=>{
      const button=element('button',arrow,'student-step primary');
      button.type='button';
      button.setAttribute('aria-label',label);
      button.title=label;
      button.onclick=()=>{
        if (button.disabled) return;
        select.selectedIndex+=step;
        select.dispatchEvent(new Event('change'));
        if (button.disabled) select.focus();
      };
      parent.append(button);
      return {step,button};
    });
    function updateArrows() {
      for(const {step,button} of buttons){
        const index=select.selectedIndex+step;
        button.disabled=index<0||index>=select.options.length;
      }
    }
    select.addEventListener('change',updateArrows);
    updateArrows();
  }
  function notice(parent,text) {parent.append(element('p',text,'muted'));}
  function chartLine(parent,title,series,individual=false) {
    parent.append(element('h3',title));
    const ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 680 290');
    svg.setAttribute('class','grade-line');
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label',title+'. Escala de 0 a 10. '+(individual?'Línea discontinua: media del grupo por evaluación.':'Referencia de aprobado en 5.')+' Los valores exactos están en la tabla inferior.');
    function draw(tag,props,text) {
      const n=document.createElementNS(ns,tag);
      for(const [attribute,value] of Object.entries(props))n.setAttribute(attribute,String(value));
      if(text!==undefined)n.textContent=text;
      svg.append(n);
      return n;
    }
    const x=index=>65+index*181;
    const y=value=>235-20*value;
    draw('rect',{x:x(3)-55,y:28,width:110,height:216,fill:'#f6e7ed',rx:6});
    for(const value of (individual?[0,2,4,6,8,10]:[0,2,4,5,6,8,10])) {
      draw('line',{x1:44,x2:648,y1:y(value),y2:y(value),stroke:value===5?'#8f122c':'#e0d1d7','stroke-dasharray':value===5?'5 4':''});
      draw('text',{x:34,y:y(value)+4,'text-anchor':'end',class:'grade-line-label'},value);
    }
    periods.forEach((period,index)=>draw('text',{x:x(index),y:264,'text-anchor':'middle',class:'grade-line-label'},labels[period]));
    series.forEach(({label,points},index)=>{
      const color=palette[index%palette.length];
      points.forEach((stats,i)=>{
        if(stats.mean===null)return;
        const isMean=individual&&index===1;
        const previous=points[i-1]?.mean;
        if(previous!=null)draw('line',{x1:x(i-1),x2:x(i),y1:y(previous),y2:y(stats.mean),stroke:color,'stroke-width':3,'stroke-opacity':isMean ? 0.72 : 1,'stroke-dasharray':index%3===1?'6 4':index%3===2?'2 3':''});
        const circle=draw('circle',{cx:x(i),cy:y(stats.mean),r:5,fill:color,'fill-opacity':isMean ? 0.65 : 1,stroke:'white','stroke-opacity':isMean ? 0.65 : 1,'stroke-width':1});
        const text=document.createElementNS(ns,'title');
        text.textContent=label+' · '+labels[periods[i]]+' · '+number(stats.mean)+(isMean?' · '+stats.n+' notas válidas':individual?'':' · '+stats.n+' notas · '+percent(failRate(stats))+' suspensos');
        circle.append(text);
      });
    });
    const scroll=element('div',undefined,'scroll grade-chart-scroll');
    scroll.append(svg);
    if(!individual)parent.append(scroll);
    if(series.length>1){
      const legend=element('div',undefined,'chart-key');
      series.forEach(({label},index)=>{
        const entry=element('span'),swatch=element('i');
        const color=palette[index%palette.length];
        if(individual&&index===1) {
          swatch.classList.add('grade-line-dashed');
          swatch.style.borderColor=color;
        } else swatch.style.background=color;
        const description=individual
          ? index===0 ? 'Granate · Nota del alumno' : 'Ocre · '+label
          : label;
        entry.append(swatch,description);legend.append(entry);
      });
      parent.append(legend);
    }
    if(individual) {
      parent.append(scroll);
      const [student,group]=series;
      table(parent,'',['Evaluación','Nota del alumno','Media del grupo','Diferencia','Notas válidas del grupo'],student.points.map((stats,i)=>{
        const reference=group.points[i];
        const difference=stats.n&&reference.n?stats.mean-reference.mean:null;
        return [labels[periods[i]],number(stats.mean),number(reference.mean),difference===null?'—':signed(difference),reference.n||'—'];
      }));
    } else {
      table(parent,'',['Grupo','Evaluación','Media','Notas válidas','% suspensos'],series.flatMap(({label,points})=>
        points.map((stats,i)=>[label,labels[periods[i]],number(stats.mean),stats.n?stats.n:'—',percent(failRate(stats))])));
    }
  }
  function evolutionText(points,individual=false) {
    const available=points.map((stats,index)=>({stats,index})).filter(item=>item.stats.n);
    if(available.length<2)return 'Se necesitan al menos dos evaluaciones con notas para comparar la evolución.';
    const first=available[0],last=available.at(-1);
    const change=last.stats.mean-first.stats.mean;
    const metric=individual?'La nota':'La media';
    const description=metric+' pasa de '+number(first.stats.mean)+' ('+labels[periods[first.index]]+') a '+number(last.stats.mean)+' ('+labels[periods[last.index]]+'), '+signed(change)+' puntos.';
    if(individual)return description;
    const failureChange=failRate(last.stats)-failRate(first.stats);
    return description+' El porcentaje de suspensos pasa de '+percent(failRate(first.stats))+' a '+percent(failRate(last.stats))+' ('+signed(failureChange)+' puntos porcentuales).';
  }
  function labelledBar(value,color) {
    const track=element('div',undefined,'track'), fill=element('span',undefined,'bar');
    track.setAttribute('aria-hidden','true');
    fill.style.width=(value??0)+'%';
    fill.style.background=color;
    track.append(fill);
    return track;
  }
  function distribution(parent,records,subject) {
    parent.append(element('h3','Distribución de notas'));
    const controls=element('div',undefined,'filters');
    const withGrades=periods.filter(period=>gradesOf(selectedRecords(records,period),subject).length);
    const select=picker(controls,'Evaluación para la distribución',periods.map(period=>[period,labels[period]]),
      selection.distribution||withGrades.at(-1),period=>{selection.distribution=period;draw();});
    const result=element('div',undefined,'grade-distribution');
    parent.append(controls,result);
    function draw() {
      result.replaceChildren();
      const grades=gradesOf(selectedRecords(records,select.value),subject);
      if(!grades.length){notice(result,'No hay notas registradas de esta materia en la evaluación.');return;}
      const counts=[0,0,0,0];
      for(const grade of grades)counts[grade<5?0:grade<7?1:grade<9?2:3]++;
      counts.forEach((count,index)=>{
        const ratio=count*100/grades.length;
        const row=element('div',undefined,'chart-row');
        row.append(element('span',bandNames[index]),labelledBar(ratio,palette[index]),element('span',count+' · '+percent(ratio)));
        result.append(row);
      });
      const highest=Math.max(...counts);
      const most=bandNames.filter((_,index)=>counts[index]===highest);
      result.append(element('p','Tramo(s) con más notas: '+most.join(' y ')+' ('+highest+' de '+grades.length+(most.length>1?' en cada tramo':'')+').','muted'));
    }
    draw();
  }
  function subjectView(parent,records) {
    const subjects=distinct(records.flatMap(record=>record.subjects));
    if(!subjects.length){notice(parent,'No hay materias en esta selección.');return;}
    const controls=element('div',undefined,'filters');
    const select=picker(controls,'Materia',subjects.map(subject=>[subject,subject]),selection.subject,value=>{selection.subject=value;draw();});
    addPickerArrows(controls,select,'Materia anterior','Materia siguiente');
    const result=element('div');
    parent.append(controls,result);
    function draw() {
      result.replaceChildren();
      const subject=select.value;
      const groups=distinct(records.map(record=>record.group));
      const series=groups.map(group=>({label:'Grupo '+group,points:periodStats(records.filter(record=>record.group===group),subject)}));
      chartLine(result,'Evolución de la nota media · '+subject,series);
      result.append(element('h3','Lectura de la evolución'),element('p',evolutionText(periodStats(records,subject))));
      if(groups.length>1)notice(result,'La lectura resume las notas válidas de todos los grupos seleccionados.');
      distribution(result,records,subject);
    }
    draw();
  }
  function studentView(parent,records) {
    const {rows}=matrixData(records,periods);
    const students=rows.sort((a,b)=>a.name.localeCompare(b.name,'es')||a.group.localeCompare(b.group,'es'));
    if(!students.length){notice(parent,'No hay alumnado en esta selección.');return;}
    const controls=element('div',undefined,'filters');
    const rowKey=row=>JSON.stringify([row.group,row.name]);
    const select=picker(controls,'Alumno/a',students.map(row=>[rowKey(row),row.name+' · '+row.group]),selection.student,value=>{selection.student=value;draw();});
    addPickerArrows(controls,select,'Alumno anterior','Alumno siguiente');
    const result=element('div');
    parent.append(controls,result);
    function draw() {
      result.replaceChildren();
      const student=students[select.selectedIndex];
      const subjects=distinct([...student.terms.values()].flatMap(grades=>Object.keys(grades)));
      if(!subjects.length){notice(result,'Este alumno no tiene notas registradas.');return;}
      if(!subjects.includes(selection.studentSubject))selection.studentSubject=subjects[0];
      const wrap=element('div',undefined,'scroll');
      const map=element('table',undefined,'grade-heatmap');
      const head=element('thead'),header=element('tr');
      for(const label of ['Materia',...periods.map(period=>labels[period])])header.append(element('th',label));
      head.append(header);map.append(head);
      const body=element('tbody');
      const detail=element('div');
      const rows=[];
      for(const subject of subjects){
        const tr=element('tr'),cell=element('th');
        cell.scope='row';
        const button=element('button',subject);
        button.setAttribute('aria-pressed','false');
        button.onclick=()=>{selection.studentSubject=subject;showDetail();};
        cell.append(button);tr.append(cell);rows.push([subject,button]);
        for(const period of periods){
          const grade=student.terms.get(period)?.[subject];
          const band=grade==null?'empty':grade<5?'low':grade<7?'pass':grade<9?'high':'top';
          tr.append(element('td',number(grade),'heat-'+band));
        }
        body.append(tr);
      }
      map.append(body);wrap.append(map);
      result.append(element('h3','Notas por materia y evaluación'),wrap,element('p','Selecciona una materia para ver su evolución. Las celdas muestran la nota exacta.','muted'),detail);
      function showDetail(){
        detail.replaceChildren();
        for(const [subject,button] of rows)button.setAttribute('aria-pressed',String(subject===selection.studentSubject));
        const points=periods.map(period=>statistics([student.terms.get(period)?.[selection.studentSubject]]));
        const groupRecords=records.filter(record=>record.group===student.group);
        const means=periodStats(groupRecords,selection.studentSubject);
        chartLine(detail,'Evolución individual · '+selection.studentSubject,[
          {label:student.name,points},
          {label:'Media del grupo '+student.group,points:means}
        ],true);
        detail.append(element('p',evolutionText(points,true)));
        notice(detail,'La media del grupo incluye todas sus notas válidas, incluida la del alumno cuando está disponible. La diferencia se expresa en puntos de nota.');
      }
      showDetail();
    }
    draw();
  }
  function courseView(parent,records) {
    const available=periods.filter(period=>selectedRecords(records,period).length);
    const options=periods.map(period=>[period,labels[period]+(available.includes(period)?'':' · Sin datos')]);
    const controls=element('div',undefined,'filters');
    const firstDefault=available.length===1 ? periods[Math.max(0,periods.indexOf(available[0])-1)] : available[0];
    const secondDefault=available.length===1 && firstDefault===available[0] ? periods[1] : available.at(-1);
    const first=picker(controls,'Primera evaluación',options,selection.first||firstDefault,value=>{selection.first=value;draw();});
    const second=picker(controls,'Segunda evaluación',options,selection.second||secondDefault,value=>{selection.second=value;draw();});
    parent.append(controls);
    const results=element('div');
    parent.append(results);
    function draw() {
      results.replaceChildren();
      if(first.value===second.value){notice(results,'Elige dos evaluaciones distintas para comparar.');return;}
      const earlier=selectedRecords(records,first.value), later=selectedRecords(records,second.value);
      const subjects=distinct([...earlier,...later].flatMap(record=>record.subjects));
      const comparisons=subjects.map(subject=>({subject,left:statistics(gradesOf(earlier,subject)),right:statistics(gradesOf(later,subject))}));
      comparisons.sort((a,b)=>(failRate(b.right)??failRate(b.left)??-1)-(failRate(a.right)??failRate(a.left)??-1));
      results.append(element('h3','Comparación de suspensos por materia'));
      if(!earlier.length||!later.length)notice(results,'Faltan notas de '+labels[!earlier.length?first.value:second.value]+'. Las materias sin datos se muestran con una raya.');
      for(const {subject,left,right} of comparisons){
        const section=element('div',undefined,'grade-comparison-item');
        section.append(element('h4',subject));
        [left,right].forEach((stats,index)=>{
          const row=element('div',undefined,'chart-row');
          const rate=failRate(stats);
          row.append(element('span',labels[index?second.value:first.value]),labelledBar(rate,palette[index]),
            element('span',rate==null?'—':percent(rate)+' ('+stats.fail+'/'+stats.n+')'));
          section.append(row);
        });
        results.append(section);
      }
      const matches=comparisons.filter(item=>item.left.n&&item.right.n);
      if(!matches.length)return;
      const changes=matches.map(item=>({subject:item.subject,difference:failRate(item.right)-failRate(item.left)}));
      const increased=changes.filter(item=>item.difference>0).sort((a,b)=>b.difference-a.difference)[0];
      const decreased=changes.filter(item=>item.difference<0).sort((a,b)=>a.difference-b.difference)[0];
      results.append(element('h3','Lectura de la comparación'));
      if(increased)results.append(element('p','Mayor aumento del porcentaje de suspensos: '+increased.subject+' ('+signed(increased.difference)+' puntos porcentuales).'));
      if(decreased)results.append(element('p','Mayor descenso del porcentaje de suspensos: '+decreased.subject+' ('+signed(decreased.difference)+' puntos porcentuales).'));
      if(!increased&&!decreased)notice(results,'El porcentaje de suspensos coincide en las materias comparables.');
      notice(results,'Cada porcentaje usa las notas válidas de su evaluación. El número de notas puede variar entre evaluaciones.');
    }
    draw();
  }
  function showCharts(records) {
    const content=$('content');
    content.replaceChildren();
    if(!records.length){empty(content);return;}
    content.append(element('h2','Gráficas'),element('p',[$('year').value,$('course').value,$('group').value?'Grupo '+$('group').value:'Todos los grupos'].join(' · '),'muted'));
    const tabs=element('div',undefined,'filters matrix-tabs');
    tabs.setAttribute('role','group');
    tabs.setAttribute('aria-label','Vistas de gráficas');
    const target=element('div',undefined,'grades-chart-panel');
    for(const [id,label] of types){
      const button=element('button',label);
      button.setAttribute('aria-pressed',String(selection.type===id));
      if(selection.type===id)button.classList.add('primary');
      button.onclick=()=>{
        selection.type=id;showCharts(records);
        content.querySelector('.matrix-tabs button[aria-pressed="true"]').focus();
      };
      tabs.append(button);
    }
    content.append(tabs,target);
    const views={subject:subjectView,student:studentView,course:courseView};
    views[selection.type](target,records);
  }
  showCharts.line=chartLine;
  return showCharts;
})();
