# RSSHub / 入退室通知 統合手順

## 1 RSSHub起動（Docker Desktopが必要）
PowerShellでBOTフォルダーに移動し `docker compose -f docker-compose.rsshub.yml up -d` を実行。ブラウザで http://127.0.0.1:1200 を確認。

## 2 BOT .env
`SOCIAL_RSS_BRIDGE_URL=http://127.0.0.1:1200` を追記。RSSHubとBOTが別PC・別コンテナの場合は接続可能なRSSHubのアドレスに変更（localhostはBOT自身を指します）。公開する場合はアクセス制御を設定してください。
XのRSS取得はRSSHub側のルート対応や認証状況に依存し、必ず取得できるわけではありません。`/rsshub-status` で接続確認後、`/latest-add` にXプロフィールURLと配信先を指定して取得テストしてください。新規登録時の既存投稿は既読扱いです。

## 3 入退室通知
`/join-leave-settings join:#参加通知 leave:#退出通知` で別々に設定。同じチャンネルを指定しても参加と退出は独立した別メッセージです。
`/welcome-settings title:ようこそ verification_channel:#認証` で参加時だけ認証先を案内し、リンクボタンを表示。退出時は退出通知のみ。
Developer Portalで Server Members Intent を有効にし、BOTにメッセージ送信・埋め込みリンク権限を付与してください。

## 4 コマンド反映
`npm install` → `npm run deploy-commands` → `npm start`。コマンドはグローバル登録なので反映に時間がかかることがあります。

## 注意
既存の data/store.json は上書きせずバックアップを取ってください。この配布ZIPにはユーザーの保存データ・.env・node_modulesを含めていません。既存のBOTフォルダーへ src 等を上書きし、既存の .env と data を維持してください。
