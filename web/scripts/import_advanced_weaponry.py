"""Reproducibly import original AdvancedWeaponry AS3 data; no code evaluation."""
from pathlib import Path
import json, re, shutil
ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'decompiled/AdvancedWeaponry'
OUT = ROOT / 'web/public/mods/advanced-weaponry'
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'data').mkdir(exist_ok=True)
source = (SRC/'scripts/AdvancedWeaponry.as').read_text(encoding='utf-8-sig')
init = source.split('public function initialize',1)[1].split('public function remove()',1)[0]
data = {}
def put(path, value):
    obj = data
    for key in path[:-1]: obj = obj.setdefault(str(key), {})
    obj[str(path[-1])] = value
calls = re.findall(r'gameRoot\.(\w+)\((.*?)\);', init, re.S)
for method, raw in calls:
    args = json.loads('['+raw+']')
    tables = {'setWeapon':'Weapons','setCaliber':'Calibers','setAmmo':'Ammo','setAttachment':'Attachments','setWeaponAnimationType':'AnimationTypes'}
    if method in tables: put(['weapons',tables[method],args[0]],args[1])
    elif method in ['setSpriteDimensions','setSpriteBoundaries']:
        key = 'spriteDimensions' if method=='setSpriteDimensions' else 'spriteBoundaries'
        put(['battleDoll',key,*args[:-1]],args[-1])
    elif method=='setItem': put(['items','Items',args[0]],{'category':args[1],'subCategory':args[2]})
    elif method=='addRecipe': put(['gamedata','workshopRecipes',args[0]],args[1])
    elif method=='addTownLocation': put(['presets','town_presets',0,args[0],'locations',args[1]],args[2])
    else: raise ValueError('Unhandled original call: '+method)
texts=(SRC/'scripts/AdvancedWeaponry/Texts.as').read_text(encoding='utf-8-sig')
texts=texts.replace("\\'", "'")
data['texts']=json.JSONDecoder().raw_decode(texts[texts.index('{',texts.index('texts:*')):])[0]
# onGameInit changes existing live shop assortment, NOT its initial stock.
stock=[]
for town,loc,obj in re.findall(r'gameRoot\.GD\.Towns\[(\d+)\]\.locations\[(\d+)\]\.assortment\.push\((\{.*?\})\);',source,re.S):
    stock.append({'town':int(town),'location':int(loc),'entry':json.loads(obj)})
put(['gamedata','modTownAssortments'],stock)
assets={}
for folder,kind in [('images','images'),('sounds','sounds')]:
    target=OUT/folder;target.mkdir(exist_ok=True)
    for f in (SRC/folder).iterdir():
        if not f.is_file(): continue
        # FFDec appends an export extension to symbols already named *.png.
        # Normalize only the exported filename; keep the original symbol key.
        export_name=re.sub(r'(?:\.png){2,}$','.png',f.name,flags=re.I) if folder=='images' else f.name
        filename=re.sub(r'^\d+_','',export_name)
        name=filename[:-4] if folder=='sounds' else filename
        shutil.copyfile(f,target/export_name)
        assets[name]=folder+'/'+export_name
        put(['manifest',kind,name],['mods/advanced-weaponry/'+folder+'/'+export_name])
manifest={'id':'advanced-weaponry','version':'1.0.0','name':'Advanced Weaponry','apiVersion':1,'enabled':True,'data':{},'assets':assets}
for key,value in data.items():
    filename='data/'+('asset-manifest' if key=='manifest' else key)+'.json';(OUT/filename).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    manifest['data'][key]=filename
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
index=ROOT/'web/public/mods/index.json';current=json.loads(index.read_text(encoding='utf-8-sig'))
entries=current if isinstance(current,list) else current.setdefault('mods',[])
url='mods/advanced-weaponry/manifest.json'
if url not in entries: entries.append(url)
index.write_text(json.dumps(current,indent=2)+'\n',encoding='utf-8')
print(f'Imported {len(calls)} initialization calls, {len(stock)} assortment additions, {len(assets)} assets, {len(data["texts"])} texts')
