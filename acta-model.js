(function(root) {
  'use strict';
  const metrics = [
    ['roster','N.º de alumnos/as en el grupo'],
    ['allPass','Alumnos/as con todo aprobado'],
    ['anyFail','Alumnos/as con algún IN'],
    ['threeFail','Alumnos/as con 3 o más IN'],
    ['totalFail','Total IN del grupo']
  ];
  const sections = {
    2:'Valoración global de los resultados académicos',
    3:'Relación de alumnos/as con rendimiento académico insuficiente y asignaturas implicadas',
    4:'Relación de alumnos/as con seguimiento de gabinete',
    5:'Observaciones del tutor al profesorado',
    6:'Observaciones del profesorado al tutor',
    7:'Conclusiones y propuestas para mejorar el rendimiento académico',
    8:'Normas de convivencia'
  };
  const instructions = {
    2:'Destacar las causas de resultados de IN inferiores al 10 % o superiores al 25 %.',
    7:'Especificar propuestas de mejora cuando se supere el 25 % de insuficientes.',
    8:'Valorar la convivencia del grupo. Indicar aspectos positivos o negativos, faltas, sanciones y propuestas.'
  };
  const tableNote = 'El porcentaje de Total IN se calcula sobre todas las calificaciones válidas de la evaluación. Los demás porcentajes se calculan sobre el alumnado del grupo.';
  const percent = (n,total) => total ? new Intl.NumberFormat('es-ES',{style:'percent',maximumFractionDigits:1}).format(n/total) : '—';
  function summarize(record) {
    if (!record) return null;
    const subjects = new Map(record.subjects.map(subject=>[subject,{evaluated:0,failed:0}]));
    const failures = [];
    let evaluated=0,allPass=0,threeFail=0,totalFail=0,totalGrades=0,gradeSum=0;
    for (const student of record.students) {
      const failed=[];
      const grades=Object.entries(student.grades);
      if (grades.length) evaluated++;
      for (const [subject,grade] of grades) {
        if (!subjects.has(subject)) subjects.set(subject,{evaluated:0,failed:0});
        const result=subjects.get(subject);
        result.evaluated++;totalGrades++;gradeSum+=grade;
        if (grade<5) {result.failed++;failed.push(subject);}
      }
      if (grades.length && !failed.length) allPass++;
      if (failed.length>=3) threeFail++;
      if (failed.length) failures.push({name:student.name,subjects:failed});
      totalFail+=failed.length;
    }
    return {roster:record.students.length,evaluated,allPass,anyFail:failures.length,threeFail,totalFail,totalGrades,
      mean:totalGrades?gradeSum/totalGrades:null,failures,subjects:[...subjects].map(([name,value])=>({name,...value}))};
  }
  function groupsTable(summaries,periods) {
    return metrics.map(([key,label])=>[label,...periods.flatMap(period=>{
      const summary=summaries[period];
      if (!summary) return ['—','—'];
      const denominator=key==='totalFail'?summary.totalGrades:summary.roster;
      const ratio=percent(summary[key],denominator);
      return [String(summary[key]),ratio];
    })]);
  }
  function interpretation(summary) {
    if (!summary?.evaluated) {
      const text='Todavía no hay notas válidas para esta evaluación.';
      return {global:[text],observations:[],measures:[]};
    }
    const {roster,evaluated,allPass,anyFail,threeFail,totalFail,subjects,mean}=summary;
    const below=subjects.filter(item=>item.evaluated && item.failed*100<10*item.evaluated);
    const above=subjects.filter(item=>item.evaluated && item.failed*100>25*item.evaluated);
    const describe=items=>items.map(item=>item.name+' ('+item.failed+'/'+item.evaluated+'; '+percent(item.failed,item.evaluated)+')').join(', ');
    const fmt = new Intl.NumberFormat('es-ES',{maximumFractionDigits:2});
    const global=[
      'De '+roster+' alumnos/as, '+evaluated+' tienen notas registradas. '+allPass+' tienen todo aprobado, '+(anyFail-threeFail)+' tienen uno o dos insuficientes y '+threeFail+' tienen tres o más. Se registran '+totalFail+' insuficientes en total.',
      anyFail+' de '+roster+' alumnos/as tienen algún insuficiente ('+percent(anyFail,roster)+').'
    ];
    if(evaluated<roster)global.push((roster-evaluated)+' alumnos/as sin ninguna nota registrada quedan fuera de las categorías de rendimiento.');
    global.push(below.length?'Materias con menos del 10 % de insuficientes: '+describe(below)+'.':'Ninguna materia con notas queda por debajo del 10 % de insuficientes.');
    global.push(above.length?'Materias con más del 25 % de insuficientes: '+describe(above)+'.':'Ninguna materia con notas supera el 25 % de insuficientes.');
    global.push('Los porcentajes por materia usan sus notas válidas como base. Las causas pueden documentarse en la aportación del tutor.');
    const observations=['La media de las '+summary.totalGrades+' calificaciones válidas es '+fmt.format(mean)+' sobre 10.'];
    if(anyFail) {
      const ranked=subjects.filter(item=>item.failed).sort((a,b)=>b.failed-a.failed);
      const max=ranked[0].failed;
      observations.push('Mayor número de insuficientes: '+describe(ranked.filter(item=>item.failed===max))+'.');
      if(threeFail)observations.push(threeFail+' alumnos/as acumulan al menos tres insuficientes. Conviene coordinar su seguimiento entre las materias implicadas.');
    } else observations.push('La evaluación no registra insuficientes entre las calificaciones válidas.');
    const measures=[];
    if(above.length)measures.push('Priorizar '+above.map(item=>item.name).join(', ')+' y revisar en el equipo docente qué criterios de evaluación concentran las dificultades. Acordar refuerzo específico y comprobar el progreso en la siguiente sesión.');
    else if(anyFail)measures.push('Revisar con el profesorado las dificultades concretas del alumnado con insuficientes y acordar tareas de recuperación y una fecha de seguimiento.');
    else measures.push('Mantener las prácticas que han favorecido el rendimiento y comprobar su evolución en la próxima evaluación.');
    if(threeFail)measures.push('Acordar un seguimiento coordinado para el alumnado con tres o más insuficientes, con responsables, plazos y evidencias de progreso.');
    return {global,observations,measures};
  }
  const api={metrics,sections,instructions,tableNote,percent,summarize,groupsTable,interpretation};
  if(typeof module!=='undefined')module.exports=api;
  else root.ActaModel=api;
})(globalThis);
