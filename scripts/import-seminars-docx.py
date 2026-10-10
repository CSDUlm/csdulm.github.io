#!/usr/bin/env python3
"""Reconcile public seminar facts from the supplied CSD planning document.

Run with the bundled Codex Python runtime. Reads the DOCX only; its internal
contacts, absences, host assignments and speaker suggestions are never exported.
The document itself remains outside the repository.
"""
import argparse
from copy import deepcopy
from datetime import date, datetime
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from zipfile import ZipFile
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'
DOC_NAME = 'CSD – Séminaire, GT et colloquium'
NOW = date(2026, 10, 10)
TZ = ZoneInfo('Europe/Paris')

def tidy(text):
    return re.sub(r'\s+', ' ', text).strip().strip('“”"')

def name_key(text):
    ascii_text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', ascii_text)

def slug(text):
    ascii_text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', ascii_text).strip('-')

def same_speaker(left, right, day):
    # The public archive's June 2024 lecture uses "Martin"; the planning
    # document and visiting-professor list identify the same Maarten de Hoop.
    keys = {name_key(left), name_key(right)}
    return len(keys) == 1 or (day == '2024-06-20' and keys == {'martindehoop', 'maartendehoop'})

def read_document(path):
    with ZipFile(path) as package:
        raw = package.read('word/document.xml')
    root = ET.fromstring(raw)
    tables = []
    for table in root.findall('.//w:tbl', NS):
        rows = []
        for row in table.findall('w:tr', NS):
            cells = []
            for cell in row.findall('w:tc', NS):
                paragraphs = []
                for paragraph in cell.findall('w:p', NS):
                    parts = []
                    for item in paragraph.iter():
                        if item.tag == W + 't': parts.append(item.text or '')
                        elif item.tag == W + 'br': parts.append('\n')
                        elif item.tag == W + 'tab': parts.append('\t')
                    paragraphs.append(''.join(parts))
                cells.append('\n'.join(paragraphs))
            rows.append(cells)
        tables.append(rows)
    paragraphs = [''.join(p.itertext()) for p in root.find('w:body', NS) if p.tag == W + 'p']
    return tables, paragraphs

# Only the public date/type/speaker/title columns are interpreted. Explicit
# overrides resolve multi-speaker cells and replacement dates without exporting
# any of the remaining private planning columns.
OVERRIDES = {
 (0,1): {'speaker':'Guy Gilboa','title':'How to Encode World Knowledge?'},
 (0,2): {'speaker':'Vladimir Petrovic; Damien Rouchousse','title':'Fast coresets for the Sinkhorn divergence / Discrete Diffusion Design: An Asymptotic Error Analysis Approach','talks':[{'speaker':'Vladimir Petrovic','title':'Fast coresets for the Sinkhorn divergence'},{'speaker':'Damien Rouchousse','title':'Discrete Diffusion Design: An Asymptotic Error Analysis Approach'}]},
 (0,3): {'speaker':'Samuel Vaiter','title':'(Trying to) Understand Steering in Language Models'},
 (0,5): {'speaker':'Nicolas Schreuder','status':'tentative'},
 (0,6): {'speaker':'Jerome Garnier Brun'},
 (0,9): {'speaker':'Pierre Gentine'},
 (0,10): {'speaker':'Antonin de Courcel','title':'Effective models in high dimensional unstable regimes: optimization dynamics at the edge of stability','status':'tentative'},
 (0,14): {'speaker':'Steven L. Brunton','status':'tentative','time':'14:00'},
 (1,13): {'speaker':'Etienne Lempereur; Raphaël Urfin','title':"Moment Guided Diffusion for Maximum Entropy Generation / Why Diffusion Models Don't Memorize: The Role of Implicit Dynamical Regularization in Training",'talks':[{'speaker':'Etienne Lempereur','title':'Moment Guided Diffusion for Maximum Entropy Generation'},{'speaker':'Raphaël Urfin','title':"Why Diffusion Models Don't Memorize: The Role of Implicit Dynamical Regularization in Training"}]},
 (1,20): {'speaker':'Ashok Vardhan','title':'From Markov to Laplace: A Markovian Tale of Large Language Models'},
 (1,33): {'speaker':'Eugène Ndiaye','status':'cancelled'},
 (1,41): {'speaker':'Constant Bourdrez; Hanna Benarroch','title':'Learning To Sample From Diffusion Models Via Inverse Reinforcement Learning / Certified Per-instance Unlearning using Individual Sensitivity Bounds','talks':[{'speaker':'Constant Bourdrez','title':'Learning To Sample From Diffusion Models Via Inverse Reinforcement Learning'},{'speaker':'Hanna Benarroch','title':'Certified Per-instance Unlearning using Individual Sensitivity Bounds'}]},
 (1,42): {'speaker':'Emmanuel Sérié; Gabriel Peyré','title':'LLM for coding tutorial','sourceNote':'The document marks Gabriel Peyré’s participation as provisional.'},
 (3,8): {'speaker':'Nicolas Schreuder','sourceNote':'The document’s “Nicolas Scwhreuder” spelling was reconciled with the matching date and full name in the old public archive.'},
 (3,28): {'speaker':'Olivier Cappé; Gabriel Peyré','title':'Modern Transformers and GRPO'},
 (3,40): {'speaker':'Luiz Chamon','title':'Learning under requirements'},
 (4,1): {'speaker':'Valérie Castin','title':'Theory of ML journal club','type':'working-group'},
 (4,2): {'speaker':'Julia Kempe','type':'colloquium'},
 (4,3): {'speaker':'Michael Sander'},
 (4,4): {'speaker':'Andrea Montanari','date':'2023-10-17','time':'12:30'},
 (4,5): {'speaker':'Nathanael Cuvelle-Magar; Raja Giryes'},
 (4,7): {'speaker':'Etienne Lempereur; Edwige Cyffers','title':'Learning Physics with Wavelet Renormalisation Group / Differential Privacy in Decentralized Learning','talks':[{'speaker':'Etienne Lempereur','title':'Learning Physics with Wavelet Renormalisation Group'},{'speaker':'Edwige Cyffers','title':'Differential Privacy in Decentralized Learning'}]},
 (4,8): {'speaker':'Antoine Maillard','date':'2023-11-14'},
 (4,9): {'speaker':'Leonardo Defilippis','title':'High-dimensional estimation under heavy-tails, with applications to robust regression','sourceNote':'The document’s “Leonardo Defillipis” spelling was reconciled with its other entries and the public archive.'},
 (4,12): {'speaker':'Mathieu Desbrun'},
 (4,13): {'speaker':'Gabriel','title':'Tutorial on Autodiff','sourceNote':'Only the speaker’s first name is recorded in the document.'},
 (4,17): {'speaker':'Maarten de Hoop','institution':'Rice','title':'Advances in the design and analysis of neural operators'},
 (4,21): {'speaker':'Noah Smith','type':'colloquium'},
 (4,22): {'speaker':'Aymeric Dieuleveut'},
 (4,23): {'speaker':'Florent Krzakala','title':'How do neural nets learn?','time':'12:00'},
 (4,24): {'speaker':'Antoine Georges','type':'colloquium'},
 (4,26): {'speaker':'Lenaic Chizat','type':'colloquium'},
 (4,27): {'speaker':'Malick','type':'seminar','sourceNote':'Only the speaker’s surname or first name “Malick” is recorded in the document.'},
 (4,30): {'speaker':'M. Jordan','type':'colloquium','sourceNote':'The document records the speaker as “M Jordan”; the name has not been expanded.'},
 (4,33): {'speaker':'Nina Vesseron; Francisco Andrade','title':"On a Neural Implementation of Brenier's Polar Factorization / Sparsistency for Inverse Optimal Transport",'talks':[{'speaker':'Nina Vesseron','title':"On a Neural Implementation of Brenier's Polar Factorization"},{'speaker':'Francisco Andrade','title':'Sparsistency for Inverse Optimal Transport'}]},
 (4,37): {'speaker':'Maarten de Hoop','dates':['2024-06-20','2024-07-02'],'title':'Lecture on neural operators','sourceNote':'The planning document records two lectures, 20 June and 2 July. The speaker’s “Martin” spelling is reconciled with the document’s Maarten de Hoop entry and the CSD visiting-professor list.'},
 (4,38): {'speaker':'Andrea Montanari','type':'colloquium'},
}
SKIP = {(1,12):'Sigma conference, not a seminar with a named speaker',
        (4,39):'CSD thematic day, not a seminar with a named speaker'}
YEARS = {0:2026, 1:2025, 3:2024, 4:2023}


def public_rows(tables):
    result = []
    excluded = []
    for table_index, start_year in YEARS.items():
        for row_index, row in enumerate(tables[table_index][1:], 1):
            if len(row) < 3: continue
            date_text, type_text, speaker_text = row[:3]
            if (table_index,row_index) in SKIP:
                excluded.append({'table':table_index,'row':row_index,'reason':SKIP[(table_index,row_index)]})
                continue
            if not speaker_text.strip() or speaker_text.strip() in ['–','/','ANNULE'] or re.match(r'Annul[ée]',speaker_text,re.I):
                excluded.append({'table':table_index,'row':row_index,'reason':'No named seminar or cancelled placeholder'})
                continue
            if not re.search(r'\d{1,2}/\d{1,2}', date_text):
                excluded.append({'table':table_index,'row':row_index,'reason':'No precise event date'})
                continue
            override = deepcopy(OVERRIDES.get((table_index,row_index),{}))
            if 'dates' in override: dates = override.pop('dates')
            elif 'date' in override: dates = [override.pop('date')]
            else:
                day,month = map(int,re.search(r'(\d{1,2})/(\d{1,2})',date_text).groups())
                dates = [date(start_year if month >= 9 else start_year + 1,month,day).isoformat()]
            normalized_type = tidy(type_text).lower()
            kind = ('colloquium' if 'colloquium' in normalized_type else 'working-group' if 'gt' in normalized_type or 'journal club' in normalized_type else 'seminar')
            lines = [tidy(s) for s in speaker_text.splitlines() if tidy(s)]
            title = ''
            if 'speaker' in override: speaker = override['speaker']
            elif len(lines)>1:
                if normalized_type.startswith('gt') or (table_index,row_index)==(1,35): speaker='; '.join(lines)
                else: speaker,title=lines[0],' '.join(lines[1:])
            else: speaker = lines[0]
            institution = override.get('institution','')
            affiliation = re.fullmatch(r'(.+?) \((.+?)\)',speaker)
            if affiliation and not institution: speaker,institution=affiliation.groups()
            if (table_index,row_index)==(1,2):speaker='Davide Carbone; Nathanael Cuvelle-Magar'
            kind = override.get('type',kind)
            title = override.get('title',title)
            status = override.get('status','cancelled' if 'cancel' in normalized_type else 'scheduled')
            explicit_time = override.get('time')
            if not explicit_time and '12h à 13h' in type_text: explicit_time='12:00'
            for event_date in dates:
                record={'speaker':speaker,'institution':institution,'title':title or 'Title not recorded','titleKnown':bool(title),'date':event_date,'type':kind,'typeKnown':bool(normalized_type or override.get('type')),'status':status,'timeKnown':False,'room':None,'roomKnown':False}
                if explicit_time or table_index==0:
                    time = explicit_time or '11:00'
                    record['date']=datetime.fromisoformat(event_date+'T'+time+':00').replace(tzinfo=TZ).isoformat()
                    record['timeKnown']=True
                    record['timeSource']='Explicit event time in supplied planning document' if explicit_time else '2026–2027 general weekday schedule in supplied planning document'
                if date.fromisoformat(event_date)>=NOW:
                    record['room']='Room W'
                    record['roomSource']='CSD default room; not individually confirmed in the supplied document'
                for key in ['talks','sourceNote']:
                    if key in override:record[key]=override[key]
                record['sourceText']=f"{event_date}, {kind}, {speaker}"+(f", {title}" if title else '')+(f" ({status})" if status!='scheduled' else '')
                record['sources']=[{'kind':'document','name':DOC_NAME,'academicYear':f'{start_year}–{start_year+1}'}]
                result.append(record)
    return result,excluded


def merge_records(database, incoming, paragraphs):
    before = deepcopy(database['seminars'])
    records = database['seminars']
    additions=updates=unchanged=0
    conflicts=[]
    for record in incoming:
        day = record['date'][:10]
        matches=[r for r in records if r['date'][:10]==day and same_speaker(r['speaker'],record['speaker'],day)]
        assert len(matches)<=1,(record,matches)
        if matches:
            old=matches[0]; new=deepcopy(old)
            for key,value in record.items():
                # Preserve richer verified titles and affiliations from the old
                # public archive when the planning document merely lists a name.
                if key=='title' and not record['titleKnown'] and old.get('titleKnown',True):continue
                if key=='titleKnown' and old.get('titleKnown',True) and not value:continue
                if key=='institution' and not value:continue
                if key=='type' and not record.get('typeKnown') and old.get('type'):continue
                if key=='sourceText' and old.get('url'):
                    new['legacySourceText']=old.get('legacySourceText',old.get('sourceText',''))
                if key=='sources':
                    prior=old.get('sources',[{'kind':'website','url':old.get('url',database.get('source'))}])
                    value=prior+[v for v in value if v not in prior]
                new[key]=value
            if old.get('titleKnown',True) and record['titleKnown'] and name_key(old['title'])!=name_key(record['title']):
                conflicts.append({'date':day,'speaker':record['speaker'],'field':'title','previous':old['title'],'imported':record['title']})
            if new!=old:old.clear();old.update(new);updates+=1
            else:unchanged+=1
        else:
            record['id']=day+'-'+slug(record['speaker'])
            assert len(record['id'])<=80,record['id']
            assert all(r['id']!=record['id'] for r in records),record['id']
            records.append(record);additions+=1
    abstract_paragraph=next((p for p in paragraphs if 'Title. From Markov to Laplace:' in p and 'Abstract.' in p),None)
    if abstract_paragraph:
        abstract=abstract_paragraph.split('Abstract.',1)[1].strip()
        ashoks=[r for r in records if r['date'][:10]=='2026-01-29' and r['speaker']=='Ashok Vardhan']
        assert len(ashoks)==1
        ashoks[0]['abstract']=abstract
    records.sort(key=lambda r:r['date'],reverse=True)
    assert len(set(r['id'] for r in records))==len(records)
    assert len(set((r['date'][:10],name_key(r['speaker'])) for r in records))==len(records)
    database['retrievedAt']=NOW.isoformat()
    database['sources']=[{'kind':'website','url':'https://csd.ens.psl.eu/?csd-seminar-webpage'},{'kind':'document','name':DOC_NAME,'academicYears':['2023–2024','2024–2025','2025–2026','2026–2027']}]
    return {'previousTotal':len(before),'documentEvents':len(incoming),'added':additions,'updated':updates,'unchanged':unchanged,'conflicts':conflicts,'total':len(records)}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('document',type=Path)
    parser.add_argument('--database',type=Path,default=Path('data/seminars.json'))
    parser.add_argument('--report',type=Path,default=Path('/tmp/csd-seminar-import-report.json'))
    args=parser.parse_args()
    tables,paragraphs=read_document(args.document)
    assert len(tables)==5,'Unexpected document structure; review rather than guessing.'
    assert '2026 / 2027' in paragraphs and '2025 / 2026' in paragraphs
    incoming,excluded=public_rows(tables)
    database=json.loads(args.database.read_text())
    report=merge_records(database,incoming,paragraphs)
    report['documentSHA256']=hashlib.sha256(args.document.read_bytes()).hexdigest()
    report['excludedRows']=excluded
    report['future']=[{k:r[k] for k in ['date','speaker','title','status','timeKnown','room','roomKnown']} for r in database['seminars'] if r['date'][:10]>=NOW.isoformat()]
    args.database.write_text(json.dumps(database,ensure_ascii=False,indent=2)+'\n')
    args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ['excludedRows','future']},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
