# Clinicus

Hekimler için kişisel işlem ve hasta kayıt defteri. Web uygulaması (PWA), internetsiz çalışır, tüm veriler cihazda saklanır.

## Çalıştırma

```bash
node serve.js
```

Ardından http://localhost:5173 adresini açın.

## Dosyalar

- `index.html`: sayfa iskeleti ve alt menü
- `app.js`: tüm uygulama mantığı. Depolama `Store` modülünde toplanır.
- `styles.css`: tasarım (açık ve koyu tema)
- `sw.js`, `manifest.webmanifest`, `icon*`: çevrimdışı çalışma ve ana ekrana ekleme

## Bulut senkronu

Ayarlar → Bulut senkronu bölümünden private bir GitHub deposuna bağlanılır. Veriler cihazda
parola ile şifrelenir (PBKDF2-SHA256 600.000 tur → AES-256-GCM) ve depoya yalnızca
`clinicus-data.enc.json` şifreli dosyası yazılır. Kayıtlar id + `updatedAt` ile birleştirilir;
silinenler `deleted` haritasında tutulur ki silme diğer cihazlara da yansısın.
Token ve türetilmiş anahtar yalnızca cihazda (`clinicus.sync.v1`) saklanır, yedek dosyalarına girmez.

## Android'e geçiş notu

Uygulama olduğu gibi [Capacitor](https://capacitorjs.com) ile Android'e sarmalanabilir. Veri katmanı yalnızca `app.js` içindeki `Store` modülünde (`load` / `save`). Android'de daha kalıcı depolama için yalnızca burası `@capacitor/preferences` veya SQLite ile değiştirilir. Dışa aktarma (`deliverFile`) için `@capacitor/filesystem` + `@capacitor/share` kullanılabilir.
