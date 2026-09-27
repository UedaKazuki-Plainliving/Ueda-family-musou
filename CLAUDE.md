# 上田家無双 〜ディスカバリー〜 開発メモ

- 本体は `musou.html` の1ファイル。依存は同梱の `three-bundle.js`（three.js r160 + EffectComposer / UnrealBloomPass / OutputPass / RoomEnvironment 等）のみ。外部CDN・外部通信を追加しないこと。
- `three-bundle.js` は「大乱闘上田家ファミリー」と共通。ライブラリ更新以外で書き換えない。
- デバッグ・テスト用に `window.__MUSOU` を公開している（`sim(秒, keysFn)` でゲームを固定ステップで進められる）。テストが依存しているので削除しない。
- 変更したら `npm test`（test/smoke.mjs）が ALL PASS になることを確認する。
- 公開は GitHub Pages（`.github/workflows/pages.yml`）。main に push すると https://uedakazuki-plainliving.github.io/Ueda-family-musou/ に自動反映される。
