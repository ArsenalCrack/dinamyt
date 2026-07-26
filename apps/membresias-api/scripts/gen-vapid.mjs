// Genera un par de llaves VAPID para Web Push. Uso:
//   pnpm --filter @dinamyt/membresias-api gen:vapid
// Copia la salida a los .env: la privada en membresias-api, la pública también en
// membresias-web como NEXT_PUBLIC_VAPID_PUBLIC_KEY.
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('# web:');
console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY=' + keys.publicKey);
