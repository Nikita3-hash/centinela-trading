// Local setup only. Do not run with log capture or publish the generated secrets.
import {webcrypto, randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const privateKey=await webcrypto.subtle.exportKey('jwk',keys.privateKey);
const publicKey=Buffer.from(await webcrypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url');
writeFileSync('.generated-secrets.json',JSON.stringify({API_ACCESS_TOKEN:randomBytes(32).toString('hex'),
  VAPID_PRIVATE_JWK:JSON.stringify(privateKey),VAPID_PUBLIC_KEY:publicKey},null,2),{mode:0o600});
console.log('Claves generadas en el archivo privado .generated-secrets.json. No subirlo a GitHub.');
