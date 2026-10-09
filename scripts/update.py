"""Public daily historical closes. No credentials or trading access."""
import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ASSETS = {
    'NVDA.US': ('NVIDIA', 'USD'), 'AAPL.US': ('Apple', 'USD'),
    'MSFT.US': ('Microsoft', 'USD'), 'AMD.US': ('AMD', 'USD'),
    'AMZN.US': ('Amazon', 'USD'), 'GOOGL.US': ('Alphabet', 'USD'),
    'META.US': ('Meta', 'USD'), 'TSLA.US': ('Tesla', 'USD'),
    'AVGO.US': ('Broadcom', 'USD'), 'PLTR.US': ('Palantir', 'USD'),
    'SOFI.US': ('SoFi', 'USD'), 'RKLB.US': ('Rocket Lab', 'USD'),
    'HIMS.US': ('Hims & Hers', 'USD'), 'HOOD.US': ('Robinhood', 'USD'),
    'IONQ.US': ('IonQ', 'USD'), 'CRWD.US': ('CrowdStrike', 'USD'),
    'SPY.US': ('SPDR S&P 500 ETF', 'USD'),
}
OUTPUT = Path(__file__).resolve().parent.parent / 'market-data.json'
MAX_AGE_DAYS = 7
SOURCE = 'Yahoo Finance chart, daily historical closes (may be delayed)'

def number(value, positive=False):
    return (isinstance(value, (float, int)) and not isinstance(value, bool)
            and math.isfinite(value) and (value > 0 if positive else value >= 0))

def validate_rows(rows, now=None):
    today = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo('America/New_York')).date()
    previous = None
    for row in rows:
        day = date.fromisoformat(row['date'])
        if day.isoformat() != row['date'] or day >= today:
            raise ValueError('fecha inválida o sesión todavía no completada')
        if previous is not None and day <= previous:
            raise ValueError('fechas duplicadas o desordenadas')
        if not number(row['close'], True) or not number(row['volume']):
            raise ValueError('precio o volumen inválido')
        previous = day
    if len(rows) < 55:
        raise ValueError(f'historial insuficiente: {len(rows)} sesiones válidas; mínimo 55')
    if (today - previous).days > MAX_AGE_DAYS:
        raise ValueError(f'último cierre demasiado antiguo: {previous}')

def analyze(prices):
    if len(prices) < 55:
        raise ValueError('historial insuficiente: mínimo 55 sesiones')
    c = [r['close'] for r in prices]
    v = [r['volume'] for r in prices]
    m20, m50 = sum(c[-20:]) / 20, sum(c[-50:]) / 50
    avgvol = sum(v[-21:-1]) / 20
    checks = [c[-1] > m20, m20 > m50, c[-1] > c[-6],
              v[-1] > avgvol * 1.15 if avgvol > 0 else False]
    return {'score': sum(checks), 'checks': checks,
            'change5': round((c[-1] / c[-6] - 1) * 100, 2),
            'ma20': round(m20, 4), 'ma50': round(m50, 4)}

def parse_chart(payload, ticker, now=None):
    chart = payload.get('chart', {})
    if chart.get('error') or not chart.get('result'):
        raise ValueError('proveedor sin cotizaciones: ' + str(chart.get('error'))[:160])
    result = chart['result'][0]
    meta = result['meta']
    if meta.get('symbol') != ticker or meta.get('currency') != 'USD':
        raise ValueError('símbolo o moneda inesperados')
    if meta.get('exchangeTimezoneName') != 'America/New_York':
        raise ValueError('zona horaria del mercado inesperada')
    today = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo('America/New_York')).date()
    timestamps = result.get('timestamp') or []
    quote = result['indicators']['quote'][0]
    closes, volumes = quote.get('close') or [], quote.get('volume') or []
    if not (len(timestamps) == len(closes) == len(volumes)):
        raise ValueError('series de fechas, precios y volúmenes inconsistentes')
    rows = []
    for stamp, close, volume in zip(timestamps, closes, volumes):
        if not number(stamp, True):
            raise ValueError('timestamp inválido')
        day = datetime.fromtimestamp(stamp, ZoneInfo('America/New_York')).date()
        if day > today:
            raise ValueError('fecha futura del proveedor')
        # Never label the current session's partial price as a daily close.
        if day == today or close is None or volume is None:
            continue
        rows.append({'date': day.isoformat(), 'close': close, 'volume': volume})
    rows.sort(key=lambda row: row['date'])
    validate_rows(rows, now)
    return rows[-130:]

def fetch(symbol, now=None):
    ticker = symbol.removesuffix('.US')
    failures = []
    for host in ('query1.finance.yahoo.com', 'query2.finance.yahoo.com'):
        for attempt in range(2):
            url = f'https://{host}/v8/finance/chart/{ticker}?range=1y&interval=1d'
            request = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 Centinela-educational/0.4',
                'Accept': 'application/json'})
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    body = response.read(2_000_001)
                if len(body) > 2_000_000:
                    raise ValueError('respuesta excesivamente grande')
                return parse_chart(json.loads(body), ticker, now)
            except (urllib.error.URLError, TimeoutError, OSError, ValueError,
                    KeyError, IndexError, TypeError) as exc:
                failures.append(f'{host}: {type(exc).__name__}: {str(exc)[:160]}')
                if isinstance(exc, urllib.error.HTTPError) and exc.code not in (429, 500, 502, 503, 504):
                    break
                if attempt == 0:
                    time.sleep(1)
    raise ValueError('; '.join(failures))

def validate_dataset(output, now=None):
    if output.get('source') != SOURCE or output.get('schema_version') != 1:
        raise ValueError('fuente o formato inesperados')
    generated = datetime.fromisoformat(output['generated_at'])
    current = now or datetime.now(timezone.utc)
    if generated.tzinfo is None or abs((current - generated).total_seconds()) > 86400:
        raise ValueError('archivo no generado recientemente')
    assets = output.get('assets')
    if not isinstance(assets, list) or not assets:
        raise ValueError('sin cotizaciones válidas')
    seen = set()
    for asset in assets:
        symbol = asset['symbol']
        if symbol not in ASSETS or symbol in seen or asset['currency'] != 'USD':
            raise ValueError('activo inesperado o duplicado')
        seen.add(symbol)
        validate_rows(asset['rows'], now)
        if asset['date'] != asset['rows'][-1]['date'] or asset['close'] != asset['rows'][-1]['close']:
            raise ValueError('último cierre inconsistente')
        analysis = analyze(asset['rows'])
        if any(asset.get(key) != value for key, value in analysis.items()):
            raise ValueError('indicadores inconsistentes')
    if output.get('expected_assets') != len(ASSETS) or not isinstance(output.get('errors'), list):
        raise ValueError('cobertura inválida')
    if len(assets) + len(output['errors']) != len(ASSETS):
        raise ValueError('cobertura incompleta sin errores declarados')

def main(path=OUTPUT):
    now = datetime.now(timezone.utc)
    records, errors = [], []
    for symbol, (name, currency) in ASSETS.items():
        try:
            rows = fetch(symbol, now)
            records.append({'symbol': symbol, 'name': name, 'currency': currency,
                            'date': rows[-1]['date'], 'close': rows[-1]['close'],
                            'rows': rows[-60:], **analyze(rows)})
            print('OK', symbol, rows[-1]['date'], flush=True)
        except Exception as exc:
            error = symbol + ': ' + str(exc)[:700]
            errors.append(error)
            print('ERROR', error, file=sys.stderr, flush=True)
    if not records:
        print('ERROR: sin cotizaciones válidas; se conserva el archivo anterior, si existe.', file=sys.stderr)
        return 1
    output = {'schema_version': 1, 'generated_at': now.isoformat(timespec='seconds'),
              'source': SOURCE, 'expected_assets': len(ASSETS),
              'scope': 'Ranking of a predefined watchlist, NOT whole-market discovery',
              'assets': records, 'errors': errors}
    validate_dataset(output, now)
    # Validate before replacing the last good file, and never emit NaN/Infinity.
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, allow_nan=False,
                                   separators=(',', ':')), encoding='utf-8')
    temporary.replace(path)
    print(f'Publicado archivo válido: {len(records)}/{len(ASSETS)} activos; {len(errors)} errores')
    return 0

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--validate', type=Path)
    args = parser.parse_args()
    if args.validate:
        validate_dataset(json.loads(args.validate.read_text(encoding='utf-8')))
        print('Archivo de cotizaciones validado')
    else:
        sys.exit(main())
