"""Centinela: daily public historical prices from Stooq; no secrets or trading access."""
import csv, io, json, os, urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Explicit, auditable candidate universe; discovery is ranking WITHIN this universe.
ASSETS = {
 'NVDA.US':('NVIDIA','USD'),'AAPL.US':('Apple','USD'),'MSFT.US':('Microsoft','USD'),
 'AMD.US':('AMD','USD'),'AMZN.US':('Amazon','USD'),'GOOGL.US':('Alphabet','USD'),
 'META.US':('Meta','USD'),'TSLA.US':('Tesla','USD'),'AVGO.US':('Broadcom','USD'),
 'PLTR.US':('Palantir','USD'),'SOFI.US':('SoFi','USD'),'RKLB.US':('Rocket Lab','USD'),
 'HIMS.US':('Hims & Hers','USD'),'HOOD.US':('Robinhood','USD'),
 'IONQ.US':('IonQ','USD'),'CRWD.US':('CrowdStrike','USD'),
 'SPY.US':('SPDR S&P 500 ETF','USD'),
}

def analyze(prices):
    if len(prices)<55: raise ValueError('historial insuficiente')
    c=[r['close'] for r in prices]; v=[r['volume'] for r in prices]
    m20=sum(c[-20:])/20; m50=sum(c[-50:])/50
    avgvol=sum(v[-21:-1])/20
    checks=[c[-1]>m20,m20>m50,c[-1]>c[-6],v[-1]>avgvol*1.15 if avgvol>0 else False]
    return {'score':sum(checks),'checks':checks,'change5':round((c[-1]/c[-6]-1)*100,2),'ma20':round(m20,4),'ma50':round(m50,4)}

def fetch(symbol):
    url='https://stooq.com/q/d/l/?s='+symbol.lower()+'&i=d'
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 Centinela-educational/0.3'})
    with urllib.request.urlopen(req,timeout=25) as response:
        body=response.read(2_000_000).decode('utf-8-sig')
    result=[]
    for r in csv.DictReader(io.StringIO(body)):
        try:
            result.append({'date':r['Date'],'close':float(r['Close']),'volume':float(r['Volume'])})
        except (KeyError,ValueError,TypeError): continue
    result.sort(key=lambda r:r['date'])
    return result[-130:]

def main():
    now=datetime.now(timezone.utc).isoformat(timespec='seconds')
    records=[]; errors=[]
    for symbol,(name,currency) in ASSETS.items():
        try:
            rows=fetch(symbol)
            a=analyze(rows)
            records.append({'symbol':symbol,'name':name,'currency':currency,'date':rows[-1]['date'],
                'close':rows[-1]['close'],'rows':rows[-60:],**a})
            print('OK',symbol,rows[-1]['date'])
        except Exception as exc:
            errors.append(symbol+': '+str(exc)[:120]);print('ERROR',symbol,str(exc)[:120])
    output={'generated_at':now,'source':'Stooq, daily historical data (may be delayed)',
            'scope':'Ranking of a predefined watchlist, NOT whole-market discovery',
            'assets':records,'errors':errors}
    path=Path(__file__).resolve().parent.parent/'market-data.json'
    # Preserve last known valid dataset if a provider outage causes all symbols to fail.
    if records: path.write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    else: print('No data fetched: retaining previous market-data.json, if any')

if __name__=='__main__': main()
