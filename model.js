(function(root) {
  'use strict';
  const clean = value => String(value ?? '').trim().replace(/\s+/g,' ');
  const key = value => clean(value).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const periods = ['1EV','2EV','3EV','FINAL'];
  const labels = {'1EV':'1.º trimestre','2EV':'2.º trimestre','3EV':'3.º trimestre',FINAL:'Final'};
  const periodOf = value => {
    const word = key(value).replace(/[. ºª_-]/g,'');
    if (['final','evaluacionfinal','evfinal'].includes(word)) return 'FINAL';
    const match = word.match(/^([123])(?:ev|evaluacion|trimestre)?$/);
    return match ? match[1]+'EV' : '';
  };
  const numberWords = ['','primero','segundo','tercero','cuarto','quinto','sexto'];
  function splitGroup(value) {
    const parts = clean(value).match(/^(.*?)\s+([A-Z])$/i);
    const course = parts ? parts[1] : clean(value);
    const match = course.match(/^(\w+)\s+(Primaria|ESO|Bachillerato|BAC)$/i);
    const number = match ? numberWords.indexOf(key(match[1])) : -1;
    return {course:number>0 ? number+'.º '+match[2].replace(/primaria/i,'Primaria') : course, group:parts?.[2].toUpperCase() || ''};
  }
  function grade(value) {
    const text = clean(value);
    if (!text) return null;
    const candidate = text.includes('_') ? text.slice(text.lastIndexOf('_')+1) : text;
    if (!/^\d{1,2}(?:[.,]\d+)?$/.test(candidate)) return null;
    const number = Number(candidate.replace(',','.'));
    return number>=0 && number<=10 ? number : null;
  }
  function readWorkbook(bytes, XLSX) {
    const book = XLSX.read(bytes,{type:'array',dense:true});
    const sessions = new Map();
    let year = '';
    let unrecognized = 0;
    for (const name of book.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',blankrows:false});
      let headings, cohort = '', tutor = '', currentName = '';
      for (const row of rows) {
        const evaluation = row.findIndex(value=>/^(evaluacion|evaluacio)$/.test(key(value)));
        const groupLine = row.flatMap(value=>typeof value==='string' ? (value.match(/(?:^|\n)\s*Grupo\s*:\s*([^\n]+)/i)?.slice(1) || []) : [])[0];
        if (groupLine) {
          cohort = clean(groupLine);currentName = '';
          tutor = clean(row.flatMap(value=>typeof value==='string' ? (value.match(/(?:^|\n)\s*Tutor(?:a|\/a)?\s*:\s*([^\n]+)/i)?.slice(1) || []) : [])[0]);
        }
        if (!year) {
          const yearCell=row.find(value=>/^20\d\d[\s/–-]+(?:20)?\d\d$/.test(clean(value)));
          if(yearCell) year=clean(yearCell).replace(/^(\d{4})[\s/–-]+(?:20)?(\d\d)$/,'$1–$2');
        }
        if (evaluation>=0) {
          const average = row.findIndex((value,index)=>index>evaluation&&/^media:?$/.test(key(value)));
          const start = average >=0 ? average+1 : evaluation+1;
          headings={evaluation,subjects:row.flatMap((value,index)=>{
            if (index<start || !clean(value) || /^(media|suspensos|pendientes|observaciones)/.test(key(value))) return [];
            return [{index,subject:clean(value).replace(/^(?:20)?\d\d\s*[-/]\s*\d\d\s+/,'')}];
          })};
          continue;
        }
        if (!headings || !headings.subjects.length) continue;
        const period = periodOf(row[headings.evaluation]);
        if (!period) continue;
        const named = row.slice(0,headings.evaluation).map(clean).filter(value=>/\p{L}/u.test(value)).pop();
        if (named) currentName=named;
        if (!currentName) continue;
        const metadata = splitGroup(cohort);
        const bucketKey = JSON.stringify([metadata.course,metadata.group,period]);
        if (!sessions.has(bucketKey)) sessions.set(bucketKey,{...metadata,tutor,period,subjects:new Set(),students:new Map()});
        const bucket=sessions.get(bucketKey);
        const grades=bucket.students.get(currentName)||new Map();
        for (const {subject,index} of headings.subjects) {
          bucket.subjects.add(subject);
          const raw=clean(row[index]), value=grade(raw);
          if(value!==null) grades.set(subject,value);
          else if(raw && !/^(np|ne|nc|no (?:evaluad[oa]|cursa|presentad[oa])|exent[oa]|-+)$/i.test(raw)) unrecognized++;
        }
        bucket.students.set(currentName,grades);
      }
    }
    if (!sessions.size) throw Error('No se encontró una tabla de evaluación. Comprueba que la exportación contiene una columna «Evaluación» y filas como 1EV, 2EV, 3EV o FINAL.');
    return {year,unrecognized,sessions:[...sessions.values()].map(item=>({
      course:item.course,group:item.group,tutor:item.tutor,period:item.period,subjects:[...item.subjects],
      students:[...item.students].map(([name,grades])=>({name,grades:Object.fromEntries(grades)}))
    }))};
  }
  const subjectAliases = new Map([
    ['historia de espana','Historia'],
    ['historia','Historia'],
    ['lengua castellana y literatura ii','Lengua'],
    ['lengua','Lengua'],
    ['lengua valenciana y literatura ii','Valencià'],
    ['valencia','Valencià'],
    ['historia de la filosofia','Filosofía'],
    ['filosofia','Filosofía'],
    ['dibujo tecnico ii','DT'],
    ['ibujo tecnico ii','DT'],
    ['dt','DT']
  ]);
  function canonicalSubject(subject) {
    const name = key(subject.normalize('NFKD'))
      .replace(/^(?:20)?\d{2}\s*[-–—/]\s*(?:20)?\d{2}\s*/, '')
      .replace(/[^a-z0-9]+/g,' ').trim();
    if (/^(?:(?:english|ingles) )?(?:cambridge|spoken)(?: |$)/.test(name)) return 'Cambridge / Spoken';
    if (/^(?:english|ingles)(?: (?:grupo |group )?[a-z][0-9]{0,2})?$/.test(name)) return 'English';
    if (/^matematicas (?:ccss|(?:aplic|aplicada|aplicadas) a las (?:c sociales|csociales|ciencias sociales|ccss)) ii$/.test(name)) return 'Matemáticas CCSS II';
    return subjectAliases.get(name) || subject;
  }
  const languageChoiceKey = (name,subject) => JSON.stringify([name,subject]);
  function consolidateSubjects(record) {
    const conflicts = [];
    const students=record.students.map(student=>{
      const subjects=new Map();
      for (const [source,value] of Object.entries(student.grades)) {
        const subject=canonicalSubject(source);
        if (!subjects.has(subject)) subjects.set(subject,[]);
        subjects.get(subject).push({source,value});
      }
      const grades=[];
      for (const [subject,entries] of subjects) {
        const choiceKey=languageChoiceKey(student.name,subject);
        const chosen=entries.find(entry=>entry.source===record.languageChoices?.[choiceKey]);
        if (entries.every(entry=>entry.value===entries[0].value)) grades.push([subject,entries[0].value]);
        else {
          conflicts.push({student:student.name,subject,entries,choiceKey,chosen:chosen?.source});
          if (chosen) grades.push([subject,chosen.value]);
        }
      }
      return {...student,grades:Object.fromEntries(grades)};
    });
    return {...record,subjects:[...new Set(record.subjects.map(canonicalSubject))],students,languageConflicts:conflicts};
  }
  function statistics(grades) {
    const values=grades.filter(value=>typeof value==='number'&&Number.isFinite(value));
    const n=values.length;
    const pass=values.filter(value=>value>=5).length;
    return {n,pass,fail:n-pass,mean:n?values.reduce((sum,value)=>sum+value,0)/n:null,rate:n?100*pass/n:null};
  }
  const api={clean,key,periods,labels,grade,readWorkbook,statistics,consolidateSubjects};
  if(typeof module!=='undefined')module.exports=api;
  else root.Grades=api;
})(globalThis);
