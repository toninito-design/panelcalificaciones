'use strict';
globalThis.ActaExport = (() => {
  const termNames = ['1.ª Eval.','2.ª Eval.','3.ª Eval.','Final'];
  const burgundy = '#8f122c';
  const chartGroups = [
    {name:'Todo aprobado',color:'#c68c0a',count:data=>data.allPass},
    {name:'1 o 2 IN',color:'#d2a0ab',count:data=>data.anyFail-data.threeFail},
    {name:'3 o más IN',color:burgundy,count:data=>data.threeFail},
    {name:'Sin notas',color:'#e7e2e4',count:data=>data.roster-data.evaluated}
  ];
  const headings = ['Indicador',...termNames.flatMap(name=>[name+' Nº',name+' %'])];
  const failureHeaders = ['Alumno/a','Asignaturas con IN','N.º IN'];
  const filename = (data,suffix) => ('acta-'+data.year+'-'+data.course+'-'+data.group+suffix).replace(/[^\p{L}\p{N}_.–-]+/gu,'-');
  const chartData = data => chartGroups.map(group=>({name:group.name,color:group.color,count:group.count(data)}));
  const lineFor = item=>item.name+' ('+item.count+')';
  const chartLabel = data=>chartData(data).map(lineFor).join(' · ');
  const failures = page => (page.summary?.failures||[]).map(item=>[item.name,item.subjects.join(', '),String(item.subjects.length)]);
  function pdf(data,page) {
    const doc = new jspdf.jsPDF();
    const margin=15;
    let y=19;
    const reserve = height=>{if(y+height>281){doc.addPage();y=18;}};
    function wrap(value,size=9,bold=false) {
      doc.setFont('helvetica',bold?'bold':'normal');
      doc.setFontSize(size);
      for (const paragraph of String(value).split('\n')) {
        for (const text of doc.splitTextToSize(paragraph||' ',180)) {
          reserve(5);doc.text(text,margin,y);y+=size*.43+1;
        }
      }
    }
    function heading(value) {
      reserve(15);y+=5;doc.setTextColor(burgundy);wrap(value,10,true);doc.setTextColor('#23171b');
    }
    function table(columns,rows,widths) {
      for (const [rowIndex,row] of [columns,...rows].entries()) {
        doc.setFont('helvetica',rowIndex?'normal':'bold');doc.setFontSize(8);
        const lines=row.map((cell,index)=>doc.splitTextToSize(String(cell),widths[index]-3));
        const height=Math.max(...lines.map(values=>values.length))*3.75+2;
        reserve(height);
        let x=margin;
        if(!rowIndex){doc.setFillColor('#f2e1e6');doc.rect(margin,y-3,180,height,'F');}
        for (const [index,text] of lines.entries()) {
          doc.text(text,x+1,y);
          x+=widths[index];
        }
        doc.setDrawColor('#dbc4cc');doc.line(margin,y+height-3,195,y+height-3);
        y+=height;
      }
    }
    doc.setTextColor(burgundy);wrap('ACTA · SESIÓN DE EVALUACIÓN',16,true);doc.setTextColor('#23171b');
    wrap('PC 04  ·  Edición 2  ·  Curso '+data.year);
    wrap('Nivel: '+data.course+'  ·  Grupo: '+data.group+'  ·  Evaluación: '+page.label);
    wrap('Tutor/a: '+(data.tutor||'________________________________'));
    heading('1. Resultados del grupo');
    table(headings,data.table,[52,...Array(8).fill(16)]);
    wrap(ActaModel.tableNote,8);
    if(page.summary?.roster){
      reserve(22);y+=3;
      wrap('Distribución del rendimiento de esta evaluación',9,true);
      let x=margin;
      for(const item of chartData(page.summary)){
        const width=180*item.count/page.summary.roster;
        if(width){doc.setFillColor(item.color);doc.rect(x,y,width,3,'F');x+=width;}
      }
      y+=8;wrap(chartLabel(page.summary),8);
    }
    for(const section of page.sections) {
      heading(section.number+'. '+section.title);
      if(ActaModel.instructions[section.number]) wrap(ActaModel.instructions[section.number],8);
      if(section.number===3 && failures(page).length) table(failureHeaders,failures(page),[64,95,21]);
      for(const text of section.lines) wrap(text);
      if(section.note) wrap(section.note);
      else if(section.editable) {
        reserve(10);
        doc.setDrawColor('#dbc4cc');
        doc.line(margin,y+3,195,y+3);y+=10;
      }
    }
    doc.save(filename(data,'-'+page.period+'.pdf'));
  }
  const esc = value => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function paragraph(value='',options={}) {
    const {size=20,bold=false,color='23171B',page=false,align='left'}=options;
    const lines=String(value).split('\n').map(text=>'<w:t xml:space="preserve">'+esc(text)+'</w:t>').join('<w:br/>');
    return '<w:p><w:pPr>'+ (page?'<w:pageBreakBefore/>':'')+'<w:spacing w:after="90"/><w:jc w:val="'+align+'"/></w:pPr><w:r><w:rPr><w:color w:val="'+color+'"/><w:sz w:val="'+size+'"/>'+(bold?'<w:b/>':'')+'</w:rPr>'+lines+'</w:r></w:p>';
  }
  function wordTable(rows,widths,colors) {
    const total=widths.reduce((a,b)=>a+b,0);
    return '<w:tbl><w:tblPr><w:tblW w:w="'+total+'" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="DBC4CC"/><w:insideH w:val="single" w:sz="4" w:color="DBC4CC"/></w:tblBorders></w:tblPr><w:tblGrid>'+widths.map(width=>'<w:gridCol w:w="'+width+'"/>').join('')+'</w:tblGrid>'+
      rows.map((cells,row)=>'<w:tr><w:trPr><w:cantSplit/>'+(!row&&!colors?'<w:tblHeader/>':'')+'</w:trPr>'+cells.map((cell,index)=>{
        const fill=colors?.[index] || (row===0?'F2E1E6':'FFFFFF');
        return '<w:tc><w:tcPr><w:tcW w:w="'+widths[index]+'" w:type="dxa"/><w:shd w:fill="'+fill+'"/></w:tcPr>'+paragraph(cell,{size:colors?10:17,bold:row===0})+'</w:tc>';
      }).join('')+'</w:tr>').join('')+'</w:tbl>';
  }
  function word(data) {
    const body = data.pages.map((page,index)=>{
      let xml=paragraph('ACTA · SESIÓN DE EVALUACIÓN',{size:32,bold:true,color:'8F122C',page:index>0})+
        paragraph('PC 04  ·  Edición 2  ·  Curso '+data.year)+
        paragraph('Nivel: '+data.course+'  ·  Grupo: '+data.group+'  ·  Evaluación: '+page.label)+
        paragraph('Tutor/a: '+(data.tutor||'________________________________'))+
        paragraph('1. Resultados del grupo',{bold:true,color:'8F122C'})+
        wordTable([headings,...data.table],[2600,...Array(8).fill(870)])+
        paragraph(ActaModel.tableNote,{size:16});
      if (page.summary?.roster) {
        const bands=chartData(page.summary).filter(item=>item.count);
        const width=bands.map(item=>Math.round(9560*item.count/page.summary.roster));
        xml+=paragraph('Distribución del rendimiento de esta evaluación',{bold:true})+
          wordTable([bands.map(()=> ' ')],width,bands.map(item=>item.color.slice(1)))+
          paragraph(chartLabel(page.summary),{size:16});
      }
      for(const section of page.sections){
        xml+=paragraph(section.number+'. '+section.title,{bold:true,color:'8F122C'});
        if(ActaModel.instructions[section.number]) xml+=paragraph(ActaModel.instructions[section.number],{size:16});
        if(section.number===3 && failures(page).length) xml+=wordTable([failureHeaders,...failures(page)],[3300,5090,1170]);
        xml+=section.lines.map(text=>paragraph(text)).join('');
        if(section.editable||section.note) xml+=paragraph(section.note);
      }
      return xml;
    }).join('');
    const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const documentXml=declaration+'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="820" w:right="1050" w:bottom="820" w:left="1050"/></w:sectPr></w:body></w:document>';
    const contents=declaration+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
    const relationships=declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const zip=fflate.zipSync({'[Content_Types].xml':fflate.strToU8(contents),'_rels/.rels':fflate.strToU8(relationships),'word/document.xml':fflate.strToU8(documentXml)});
    const url=URL.createObjectURL(new Blob([zip],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
    const link=document.createElement('a');
    link.href=url;link.download=filename(data,'.docx');
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    return zip;
  }
  return {chartGroups,chartData,chartLabel,pdf,word,termNames,failures,failureHeaders};
})();
