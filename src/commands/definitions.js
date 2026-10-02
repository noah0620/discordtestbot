import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

export const commandData = [
  new SlashCommandBuilder().setName('help').setDescription('BOTの機能一覧を表示'),

  new SlashCommandBuilder().setName('join-leave').setDescription('入退室通知・参加案内の設定と確認')
    .addSubcommand(sc=>sc.setName('notification').setDescription('入室・退出通知のチャンネルと通知対象を設定')
      .addStringOption(o=>o.setName('type').setDescription('通知する種類').setRequired(true).addChoices(
        {name:'入室通知のみ',value:'join'},{name:'退出通知のみ',value:'leave'},{name:'入室＋退出',value:'both'},{name:'通知OFF',value:'off'}))
      .addChannelOption(o=>o.setName('channel').setDescription('通知先チャンネル（通知OFF以外は必須）').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('status').setDescription('現在の入退室通知設定を確認'))
    .addSubcommand(sc=>sc.setName('welcome').setDescription('参加通知タイトル・認証案内を設定')
      .addStringOption(o=>o.setName('title').setDescription('参加通知のタイトル（例: ようこそ！）'))
      .addChannelOption(o=>o.setName('verification_channel').setDescription('新規参加者へ案内する認証パネルチャンネル').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('welcome-status').setDescription('参加通知・認証案内設定を確認')),

  new SlashCommandBuilder().setName('era').setDescription('西暦・和暦・年号を検索・相互変換')
    .addSubcommand(sc=>sc.setName('search').setDescription('西暦・和暦・年号を検索')
      .addStringOption(o=>o.setName('query').setDescription('例: 2026 / 令和8年 / 昭和 / 1989-01-08').setRequired(true))),

  new SlashCommandBuilder().setName('latest-add').setDescription('【管理者】URLを貼るだけで最新情報の自動取得を登録')
    .addStringOption(o=>o.setName('url').setDescription('プロフィールURLまたはRSS/Atom URL').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('新着の投稿先').setRequired(true).addChannelTypes(ChannelType.GuildText)),

  new SlashCommandBuilder().setName('game').setDescription('Discordで遊べるミニゲーム')
    .addSubcommand(sc=>sc.setName('tictactoe').setDescription('9マスの三目並べ（対人/BOT対戦）')
      .addUserOption(o=>o.setName('opponent').setDescription('対戦相手（省略するとBOT対戦）').setRequired(false)))
    .addSubcommand(sc=>sc.setName('gomoku').setDescription('5×5の五目並べ（対人/BOT対戦）')
      .addUserOption(o=>o.setName('opponent').setDescription('対戦相手（省略するとBOT対戦）').setRequired(false)))
    .addSubcommand(sc=>sc.setName('rps').setDescription('じゃんけん（対人/BOT対戦）')
      .addUserOption(o=>o.setName('opponent').setDescription('対戦相手（省略するとBOT対戦）').setRequired(false)))
    .addSubcommand(sc=>sc.setName('othello').setDescription('オセロ（対人/BOT対戦）')
      .addUserOption(o=>o.setName('opponent').setDescription('対戦相手（省略するとBOT対戦）').setRequired(false)))
    .addSubcommand(sc=>sc.setName('chess').setDescription('チェス（対人/BOT対戦）')
      .addUserOption(o=>o.setName('opponent').setDescription('対戦相手（省略するとBOT対戦）').setRequired(false)))
    .addSubcommand(sc=>sc.setName('shogi').setDescription('将棋（対人/BOT対戦）')
      .addUserOption(o=>o.setName('opponent').setDescription('対戦相手（省略するとBOT対戦）').setRequired(false))),

  new SlashCommandBuilder().setName('points').setDescription('ポイントカード・チャットポイント')
    .addSubcommand(sc=>sc.setName('balance').setDescription('自分または指定ユーザーのポイントを確認').addUserOption(o=>o.setName('user').setDescription('確認するユーザー')))
    .addSubcommand(sc=>sc.setName('leaderboard').setDescription('サーバーのポイントランキング'))
    .addSubcommand(sc=>sc.setName('settings').setDescription('【管理者】チャットで貯まるポイント数を設定')
      .addIntegerOption(o=>o.setName('per_message').setDescription('1回の加算ポイント').setRequired(true).setMinValue(0).setMaxValue(10000))
      .addIntegerOption(o=>o.setName('cooldown_seconds').setDescription('再加算までの秒数').setMinValue(5).setMaxValue(3600))),

  new SlashCommandBuilder().setName('chat-rank').setDescription('チャットランクを確認')
    .addSubcommand(sc=>sc.setName('me').setDescription('自分または指定ユーザーのランクを確認').addUserOption(o=>o.setName('user').setDescription('確認するユーザー')))
    .addSubcommand(sc=>sc.setName('leaderboard').setDescription('チャットランキングを表示')),

  new SlashCommandBuilder().setName('lottery').setDescription('ポイントで遊べる宝くじ（現金・換金不可）')
    .addSubcommand(sc=>sc.setName('info').setDescription('宝くじの価格・当選内容を表示'))
    .addSubcommand(sc=>sc.setName('buy').setDescription('ポイントで宝くじを購入').addIntegerOption(o=>o.setName('tickets').setDescription('購入枚数').setRequired(true).setMinValue(1).setMaxValue(100)))
    .addSubcommand(sc=>sc.setName('settings').setDescription('【管理者】宝くじのポイント設定')
      .addIntegerOption(o=>o.setName('ticket_price').setDescription('1枚の価格（ポイント）').setRequired(true).setMinValue(1))
      .addIntegerOption(o=>o.setName('first_prize').setDescription('1等付与ポイント').setRequired(true).setMinValue(0))
      .addIntegerOption(o=>o.setName('second_prize').setDescription('2等付与ポイント').setRequired(true).setMinValue(0))
      .addIntegerOption(o=>o.setName('third_prize').setDescription('3等付与ポイント').setRequired(true).setMinValue(0))),

  new SlashCommandBuilder().setName('timer').setDescription('タイマーを開始・確認・キャンセル')
    .addSubcommand(sc=>sc.setName('start').setDescription('3分・5分・10分のショートカットで開始')
      .addIntegerOption(o=>o.setName('minutes').setDescription('時間').setRequired(true).addChoices(
        {name:'3分',value:3},{name:'5分',value:5},{name:'10分',value:10}
      )))
    .addSubcommand(sc=>sc.setName('custom').setDescription('1〜1440分で時間を指定して開始')
      .addIntegerOption(o=>o.setName('minutes').setDescription('分数').setRequired(true).setMinValue(1).setMaxValue(1440)))
    .addSubcommand(sc=>sc.setName('status').setDescription('自分のタイマー残り時間を確認'))
    .addSubcommand(sc=>sc.setName('cancel').setDescription('自分のタイマーをキャンセル')),

  new SlashCommandBuilder().setName('image').setDescription('画像変換・加工ツール')
    .addSubcommand(sc=>sc.setName('bg-remove').setDescription('画像の背景をAIで透過してPNGに変換')
      .addAttachmentOption(o=>o.setName('image').setDescription('背景を透過する画像').setRequired(true)))
    .addSubcommand(sc=>sc.setName('pdf').setDescription('画像ファイルをPDFに変換')
      .addAttachmentOption(o=>o.setName('image').setDescription('PDFに変換する画像').setRequired(true)))
    .addSubcommand(sc=>sc.setName('compress').setDescription('Discordプラン別の上限サイズに画像を自動圧縮')
      .addAttachmentOption(o=>o.setName('image').setDescription('圧縮する画像').setRequired(true))
      .addStringOption(o=>o.setName('plan').setDescription('圧縮先サイズを選択').setRequired(true).addChoices(
        {name:'通常プラン（20MB）',value:'normal'},
        {name:'Nitro Basic（50MB）',value:'basic'},
        {name:'Nitro（1GB）',value:'nitro'}
      )))
    .addSubcommand(sc=>sc.setName('video-compress').setDescription('動画を5MB以下に自動圧縮してMP4に変換')
      .addAttachmentOption(o=>o.setName('video').setDescription('5MB以下に圧縮する動画').setRequired(true)))
    .addSubcommand(sc=>sc.setName('enhance').setDescription('画像を高画質化・拡大')
      .addAttachmentOption(o=>o.setName('image').setDescription('高画質化する画像').setRequired(true))
      .addIntegerOption(o=>o.setName('scale').setDescription('拡大倍率').setRequired(true).addChoices(
        {name:'2倍',value:2},{name:'4倍',value:4}
      ))),

  new SlashCommandBuilder().setName('download').setDescription('SNS動画の取得・動画URL投稿')
    .addStringOption(o=>o.setName('url').setDescription('YouTube / X / TikTok / Instagram の投稿URL、または動画URL').setRequired(true))
    .addStringOption(o=>o.setName('format').setDescription('処理方法').setRequired(true).addChoices(
      {name:'MP4（動画）',value:'mp4'},{name:'MP3（音声）',value:'mp3'},{name:'URLをそのまま投稿',value:'link'}
    )),

  new SlashCommandBuilder().setName('system').setDescription('BOT情報・診断・サポート')
    .addSubcommand(sc=>sc.setName('support').setDescription('サポートサーバーの招待リンクを表示'))
    .addSubcommand(sc=>sc.setName('ping').setDescription('BOT応答確認'))
    .addSubcommand(sc=>sc.setName('owner-status').setDescription('BOTオーナー判定を確認'))
    .addSubcommand(sc=>sc.setName('restart').setDescription('【BOTオーナー専用】BOTを安全に再起動'))
    .addSubcommand(sc=>sc.setName('diagnostics').setDescription('【管理者】BOT権限・設定の動作診断'))
    .addSubcommand(sc=>sc.setName('rsshub-status').setDescription('【管理者】自前RSSHubの接続状態を確認')),

  new SlashCommandBuilder().setName('admin-role').setDescription('管理者ロール設定')
    .addSubcommand(sc=>sc.setName('set').setDescription('【管理】管理者ロールを追加（複数設定可）')
    .addRoleOption(o=>o.setName('role').setDescription('追加する管理者ロール').setRequired(true)))
    .addSubcommand(sc=>sc.setName('remove').setDescription('【管理】管理者ロールを解除')
    .addRoleOption(o=>o.setName('role').setDescription('解除する管理者ロール').setRequired(true)))
    .addSubcommand(sc=>sc.setName('status').setDescription('管理者ロール設定を確認')),

  new SlashCommandBuilder().setName('shop').setDescription('自動販売機の管理')
    .addSubcommand(sc=>sc.setName('create').setDescription('自分の自動販売機を作成')
    .addStringOption(o=>o.setName('name').setDescription('自動販売機名').setRequired(true))
    .addRoleOption(o=>o.setName('manager_role').setDescription('管理ロール'))
    .addChannelOption(o=>o.setName('order_channel').setDescription('販売者への注文通知先').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o=>o.setName('sales_channel').setDescription('購入実績の配信先').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o=>o.setName('history_channel').setDescription('管理者用の購入履歴固定チャンネル').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('list').setDescription('このサーバーの自動販売機一覧'))
    .addSubcommand(sc=>sc.setName('config').setDescription('自動販売機設定')
    .addIntegerOption(o=>o.setName('shop_id').setDescription('自販機ID').setRequired(true))
    .addStringOption(o=>o.setName('name').setDescription('新しい自販機名'))
    .addRoleOption(o=>o.setName('manager_role').setDescription('管理ロール'))
    .addChannelOption(o=>o.setName('order_channel').setDescription('販売者への注文通知先').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o=>o.setName('sales_channel').setDescription('購入実績の配信先').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o=>o.setName('history_channel').setDescription('管理者用の購入履歴固定チャンネル').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('delete').setDescription('自動販売機を停止')
    .addIntegerOption(o=>o.setName('shop_id').setDescription('自販機ID').setRequired(true)))
    .addSubcommand(sc=>sc.setName('admin').setDescription('【管理者】自販機・注文状況を確認'))
    .addSubcommand(sc=>sc.setName('panel').setDescription('販売パネル設置')
    .addIntegerOption(o=>o.setName('shop_id').setDescription('自販機ID').setRequired(true)))
    .addSubcommand(sc=>sc.setName('orders').setDescription('指定自販機の注文一覧')
    .addIntegerOption(o=>o.setName('shop_id').setDescription('自販機ID').setRequired(true))),

  new SlashCommandBuilder().setName('product').setDescription('商品の管理')
    .addSubcommand(sc=>sc.setName('add').setDescription('自動販売機に商品追加')
    .addIntegerOption(o=>o.setName('shop_id').setDescription('自販機ID').setRequired(true))
    .addStringOption(o=>o.setName('name').setDescription('商品名').setRequired(true))
    .addIntegerOption(o=>o.setName('price').setDescription('単価').setRequired(true).setMinValue(0))
    .addIntegerOption(o=>o.setName('point_price').setDescription('ポイント購入価格（未設定=ポイント購入不可）').setMinValue(0))
    .addIntegerOption(o=>o.setName('stock').setDescription('在庫（-1=無制限）').setRequired(true).setMinValue(-1))
    .addStringOption(o=>o.setName('description').setDescription('商品説明'))
    .addStringOption(o=>o.setName('image_url').setDescription('商品画像URL（https）'))
    .addStringOption(o=>o.setName('delivery_mode').setDescription('販売データ方式').addChoices(
      {name:'ZIPファイル',value:'zip'},{name:'ギガファイル便URL',value:'gigafile'},{name:'通常URL',value:'url'}
    ))
    .addAttachmentOption(o=>o.setName('zip_file').setDescription('販売するZIPファイル（Discord添付上限内）'))
    .addStringOption(o=>o.setName('download_url').setDescription('通常のダウンロードURL'))
    .addStringOption(o=>o.setName('gigafile_url').setDescription('ギガファイル便URL'))
    .addIntegerOption(o=>o.setName('url_expiry_days').setDescription('URL有効期限までの日数').setMinValue(1).setMaxValue(365))
    .addStringOption(o=>o.setName('delivery').setDescription('購入完了後DM補足'))
    .addStringOption(o=>o.setName('delivery_file_url').setDescription('購入完了後に送るファイルURL'))
    .addRoleOption(o=>o.setName('role').setDescription('購入完了後に付与するロール')))
    .addSubcommand(sc=>sc.setName('list').setDescription('指定自販機の商品一覧')
    .addIntegerOption(o=>o.setName('shop_id').setDescription('自販機ID').setRequired(true)))
    .addSubcommand(sc=>sc.setName('edit').setDescription('商品・在庫を変更')
    .addIntegerOption(o=>o.setName('shop_id').setDescription('自販機ID').setRequired(true))
    .addStringOption(o=>o.setName('product_id').setDescription('商品ID').setRequired(true))
    .addStringOption(o=>o.setName('name').setDescription('新しい商品名'))
    .addIntegerOption(o=>o.setName('price').setDescription('新しい価格').setMinValue(0))
    .addIntegerOption(o=>o.setName('point_price').setDescription('新しいポイント価格（0=ポイント購入不可）').setMinValue(0))
    .addIntegerOption(o=>o.setName('stock').setDescription('新しい在庫（-1=無制限）').setMinValue(-1))
    .addStringOption(o=>o.setName('description').setDescription('新しい商品説明'))
    .addStringOption(o=>o.setName('image_url').setDescription('新しい商品画像URL（https）'))
    .addStringOption(o=>o.setName('delivery_mode').setDescription('販売データ方式').addChoices(
      {name:'ZIPファイル',value:'zip'},{name:'ギガファイル便URL',value:'gigafile'},{name:'通常URL',value:'url'}
    ))
    .addAttachmentOption(o=>o.setName('zip_file').setDescription('新しいZIPファイル（Discord添付上限内）'))
    .addStringOption(o=>o.setName('download_url').setDescription('新しい通常ダウンロードURL'))
    .addStringOption(o=>o.setName('gigafile_url').setDescription('更新するギガファイル便URL'))
    .addIntegerOption(o=>o.setName('url_expiry_days').setDescription('新しいURL有効期限までの日数').setMinValue(1).setMaxValue(365))
    .addStringOption(o=>o.setName('delivery').setDescription('新しい購入完了DM補足'))
    .addStringOption(o=>o.setName('delivery_file_url').setDescription('新しい配布ファイルURL'))
    .addRoleOption(o=>o.setName('role').setDescription('購入後に付与するロール')))
    .addSubcommand(sc=>sc.setName('url-update').setDescription('ギガファイル便URLと期限だけ更新')
    .addIntegerOption(o=>o.setName('shop_id').setDescription('自販機ID').setRequired(true))
    .addStringOption(o=>o.setName('product_id').setDescription('商品ID').setRequired(true))
    .addStringOption(o=>o.setName('gigafile_url').setDescription('新しいギガファイル便URL').setRequired(true))
    .addIntegerOption(o=>o.setName('url_expiry_days').setDescription('URL有効期限までの日数').setRequired(true).setMinValue(1).setMaxValue(365)))
    .addSubcommand(sc=>sc.setName('remove').setDescription('商品を販売停止')
    .addIntegerOption(o=>o.setName('shop_id').setDescription('自販機ID').setRequired(true))
    .addStringOption(o=>o.setName('product_id').setDescription('商品ID').setRequired(true))),

  new SlashCommandBuilder().setName('verify').setDescription('認証機能')
    .addSubcommand(sc=>sc.setName('panel').setDescription('用途を指定した認証申請パネルを設置')
    // Discord API仕様: 必須オプションは任意オプションより前に置く
    .addStringOption(o=>o.setName('name').setDescription('申請名（例: R18閲覧 / 配信者申請）').setRequired(true))
    .addRoleOption(o=>o.setName('role').setDescription('承認後に付与するロール').setRequired(true))
    .addChannelOption(o=>o.setName('approval_channel').setDescription('認証申請の承認通知を送るチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addStringOption(o=>o.setName('additional_roles').setDescription('追加ロールID/メンションをカンマ区切り（最大19件）'))
    .addStringOption(o=>o.setName('description').setDescription('申請条件・説明')))
    .addSubcommand(sc=>sc.setName('admin').setDescription('【管理者】認証申請を確認・承認'))
    .addSubcommand(sc=>sc.setName('status').setDescription('【管理者】認証パネル設定を確認'))
    .addSubcommand(sc=>sc.setName('settings').setDescription('【管理者】認証申請の承認通知先を変更')
    .addChannelOption(o=>o.setName('approval_channel').setDescription('承認通知チャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText))),

  new SlashCommandBuilder().setName('role').setDescription('ロール機能')
    .addSubcommand(sc=>sc.setName('panel').setDescription('【管理者】このチャンネル専用のボタン式ロールパネルを設置')
    .addStringOption(o=>o.setName('title').setDescription('パネルタイトル').setRequired(false))
    .addStringOption(o=>o.setName('description').setDescription('説明文').setRequired(false)))
    .addSubcommand(sc=>sc.setName('add').setDescription('【管理者】ロールを最大5個まとめて追加・パネルを自動表示')
    .addRoleOption(o=>o.setName('role').setDescription('追加するロール1').setRequired(true))
    .addRoleOption(o=>o.setName('role2').setDescription('追加するロール2'))
    .addRoleOption(o=>o.setName('role3').setDescription('追加するロール3'))
    .addRoleOption(o=>o.setName('role4').setDescription('追加するロール4'))
    .addRoleOption(o=>o.setName('role5').setDescription('追加するロール5'))
    .addStringOption(o=>o.setName('label').setDescription('ロール1のボタン名（省略時はロール名）'))
    .addStringOption(o=>o.setName('mode').setDescription('取得方法（全ロール共通）').addChoices({name:'即時付与',value:'instant'},{name:'管理者承認',value:'approval'}))
    .addChannelOption(o=>o.setName('approval_channel').setDescription('承認申請の通知先（承認制のみ）').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o=>o.setName('channel').setDescription('対象チャンネル（省略時は現在のチャンネル）').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('list').setDescription('【管理者】チャンネル専用ロール一覧')
    .addChannelOption(o=>o.setName('channel').setDescription('対象チャンネル（省略時は現在のチャンネル）').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('remove').setDescription('【管理者】チャンネル専用ロールを削除')
    .addRoleOption(o=>o.setName('role').setDescription('ロール').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('対象チャンネル（省略時は現在のチャンネル）').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('create').setDescription('【管理者】ロールを作成（実行後にカラーパネル表示）')
    .addStringOption(o=>o.setName('name').setDescription('ロール名').setRequired(true))
    .addStringOption(o=>o.setName('permission').setDescription('権限プリセット').addChoices(
      {name:'権限なし',value:'none'},{name:'一般（メッセージ等）',value:'member'},{name:'モデレーター',value:'moderator'},{name:'管理者',value:'administrator'}
    ))
    .addBooleanOption(o=>o.setName('mentionable').setDescription('メンション可能にする'))
    .addBooleanOption(o=>o.setName('hoist').setDescription('メンバー一覧で分けて表示')))
    .addSubcommand(sc=>sc.setName('delete').setDescription('【管理者】ロールを削除')
    .addRoleOption(o=>o.setName('role').setDescription('削除するロール').setRequired(true))),

  new SlashCommandBuilder().setName('weather').setDescription('天気予報・自動投稿設定')
    .addSubcommand(sc=>sc.setName('forecast').setDescription('登録地域の天気を表示。地域指定も可能')
    .addStringOption(o=>o.setName('region').setDescription('省略時は登録済み地域をすべて表示').setAutocomplete(true)))
    .addSubcommand(sc=>sc.setName('register').setDescription('【管理者】天気地域を追加・削除')
    .addStringOption(o=>o.setName('action').setDescription('操作').setRequired(true).addChoices(
      {name:'追加',value:'add'},{name:'削除',value:'remove'},{name:'全削除',value:'clear'}
    ))
    .addStringOption(o=>o.setName('region').setDescription('47都道府県・地方・全国').setAutocomplete(true)))
    .addSubcommand(sc=>sc.setName('admin').setDescription('【管理者】天気地域登録の詳細を表示'))
    .addSubcommand(sc=>sc.setName('channel').setDescription('【管理者】地域・地方ごとの天気投稿チャンネルを設定')
    .addStringOption(o=>o.setName('region').setDescription('都道府県・地方・全国').setAutocomplete(true).setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('この地域の天気投稿先').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('channel-remove').setDescription('【管理者】地域・地方ごとの投稿先設定を解除')
    .addStringOption(o=>o.setName('region').setDescription('都道府県・地方・全国').setAutocomplete(true).setRequired(true)))
    .addSubcommand(sc=>sc.setName('list').setDescription('【管理者】登録済み天気地域を表示'))
    .addSubcommandGroup(sc=>sc.setName('auto').setDescription('【管理者】天気の自動投稿を複数チャンネル設定')
    .addSubcommand(sc=>sc.setName('setup').setDescription('従来の共通自動投稿を設定')
      .addBooleanOption(o=>o.setName('enabled').setDescription('ON/OFF').setRequired(true))
      .addStringOption(o=>o.setName('time').setDescription('毎日の投稿時刻 例: 07:00 / 18:30'))
      .addChannelOption(o=>o.setName('channel').setDescription('共通投稿先').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('add').setDescription('地域・投稿先・時刻を追加（複数登録可）')
      .addStringOption(o=>o.setName('region').setDescription('都道府県・地方・全国').setRequired(true))
      .addChannelOption(o=>o.setName('channel').setDescription('投稿先').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addStringOption(o=>o.setName('time').setDescription('日本時間 HH:MM').setRequired(true)))
    .addSubcommand(sc=>sc.setName('list').setDescription('複数チャンネルの自動投稿設定を一覧表示'))
    .addSubcommand(sc=>sc.setName('remove').setDescription('複数自動投稿設定を削除')
      .addIntegerOption(o=>o.setName('id').setDescription('設定ID').setRequired(true))))
    .addSubcommand(sc=>sc.setName('setup').setDescription('【管理者】天気自動投稿を簡単設定')
    .addStringOption(o=>o.setName('area').setDescription('全国または地方').setRequired(true).addChoices(
      {name:'全国47都道府県',value:'全国'},{name:'北海道地方',value:'北海道地方'},{name:'東北地方',value:'東北地方'},{name:'関東地方',value:'関東地方'},{name:'中部地方',value:'中部地方'},{name:'近畿地方',value:'近畿地方'},{name:'中国地方',value:'中国地方'},{name:'四国地方',value:'四国地方'},{name:'九州地方',value:'九州地方'},{name:'九州・沖縄地方',value:'九州・沖縄地方'},{name:'沖縄地方',value:'沖縄地方'}))
    .addChannelOption(o=>o.setName('channel').setDescription('投稿先').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addStringOption(o=>o.setName('time').setDescription('JST HH:MM').setRequired(true))
    .addBooleanOption(o=>o.setName('enabled').setDescription('自動配信・自動更新をON/OFF（省略時ON）'))
    .addBooleanOption(o=>o.setName('test_now').setDescription('設定直後にテスト配信する（省略時ON）'))),

  new SlashCommandBuilder().setName('earthquake').setDescription('地震速報・自動投稿設定')
    .addSubcommand(sc=>sc.setName('latest').setDescription('最新地震情報'))
    .addSubcommand(sc=>sc.setName('register').setDescription('地震通知地域を追加')
    .addStringOption(o=>o.setName('region').setDescription('地域').setAutocomplete(true).setRequired(true))
    .addIntegerOption(o=>o.setName('min_intensity').setDescription('最低震度 1〜7').setMinValue(1).setMaxValue(7)))
    .addSubcommand(sc=>sc.setName('list').setDescription('登録済み地震地域'))
    .addSubcommand(sc=>sc.setName('auto').setDescription('自動地震速報ON/OFF・投稿先設定')
    .addBooleanOption(o=>o.setName('enabled').setDescription('ON/OFF').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('地震速報の投稿先').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('setup').setDescription('【管理者】地震速報を簡単設定')
    .addChannelOption(o=>o.setName('channel').setDescription('投稿先').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addStringOption(o=>o.setName('area').setDescription('全国または対象地方').setRequired(true).addChoices(
      {name:'全国',value:'全国'},{name:'北海道地方',value:'北海道地方'},{name:'東北地方',value:'東北地方'},{name:'関東地方',value:'関東地方'},{name:'中部地方',value:'中部地方'},{name:'近畿地方',value:'近畿地方'},{name:'中国地方',value:'中国地方'},{name:'四国地方',value:'四国地方'},{name:'九州地方',value:'九州地方'},{name:'九州・沖縄地方',value:'九州・沖縄地方'},{name:'沖縄地方',value:'沖縄地方'}))
    .addIntegerOption(o=>o.setName('min_intensity').setDescription('最低震度').setMinValue(1).setMaxValue(7))
    .addBooleanOption(o=>o.setName('enabled').setDescription('自動配信・自動更新をON/OFF（省略時ON）'))
    .addBooleanOption(o=>o.setName('test_now').setDescription('設定直後に現在の地震情報をテスト配信する（省略時ON）')))
    .addSubcommand(sc=>sc.setName('auto-add').setDescription('【管理者】地震速報の自動投稿を複数登録')
    .addStringOption(o=>o.setName('region').setDescription('都道府県・地方・全国').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('投稿先').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addIntegerOption(o=>o.setName('min_intensity').setDescription('最低震度 1〜7').setMinValue(1).setMaxValue(7)))
    .addSubcommand(sc=>sc.setName('auto-list').setDescription('【管理者】複数地震速報設定を一覧表示'))
    .addSubcommand(sc=>sc.setName('auto-remove').setDescription('【管理者】地震速報の自動投稿設定を削除')
    .addIntegerOption(o=>o.setName('id').setDescription('設定ID').setRequired(true))),

  new SlashCommandBuilder().setName('ticket').setDescription('チケット機能')
    .addSubcommand(sc=>sc.setName('panel').setDescription('チケット作成パネル'))
    .addSubcommand(sc=>sc.setName('settings').setDescription('チケットカテゴリ・サポートロール・作成ログ設定')
    .addChannelOption(o=>o.setName('category').setDescription('作成先カテゴリ').addChannelTypes(ChannelType.GuildCategory))
    .addRoleOption(o=>o.setName('support_role').setDescription('サポートロール'))
    .addChannelOption(o=>o.setName('log_channel').setDescription('チケット作成ログの投稿先').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('log-channel').setDescription('チケット作成ログの投稿先を変更・停止・確認')
    .addChannelOption(o=>o.setName('channel').setDescription('新しいログ投稿先').addChannelTypes(ChannelType.GuildText))
    .addBooleanOption(o=>o.setName('disable').setDescription('ログ投稿を停止する（true）')))
    .addSubcommand(sc=>sc.setName('status').setDescription('チケット設定を確認')),

  new SlashCommandBuilder().setName('autoreply').setDescription('自動返信設定')
    .addSubcommand(sc=>sc.setName('add').setDescription('自動返信追加')
    .addStringOption(o=>o.setName('keyword').setDescription('キーワード').setRequired(true))
    .addStringOption(o=>o.setName('reply').setDescription('返信内容').setRequired(true))
    .addStringOption(o=>o.setName('mode').setDescription('判定方法').addChoices(
      {name:'部分一致',value:'contains'},{name:'完全一致',value:'exact'}
    )))
    .addSubcommand(sc=>sc.setName('remove').setDescription('自動返信削除')
    .addStringOption(o=>o.setName('keyword').setDescription('キーワード').setRequired(true)))
    .addSubcommand(sc=>sc.setName('list').setDescription('登録済み自動返信一覧')),

  new SlashCommandBuilder().setName('guild').setDescription('サーバー共通設定')
    .addSubcommand(sc=>sc.setName('settings').setDescription('通知先を設定')
    .addChannelOption(o=>o.setName('join_log').setDescription('参加通知').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o=>o.setName('leave_log').setDescription('退出通知').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o=>o.setName('earthquake').setDescription('地震通知').addChannelTypes(ChannelType.GuildText))
    .addChannelOption(o=>o.setName('weather').setDescription('天気通知').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('status').setDescription('サーバー通知設定を確認'))
    .addSubcommand(sc=>sc.setName('legacy-setting').setDescription('旧版互換: サーバー共通設定をIDで保存')
    .addStringOption(o=>o.setName('key').setDescription('設定項目').setRequired(true).addChoices(
      {name:'認証ロールID',value:'verification_role_id'},
      {name:'入室チャンネルID',value:'welcome_channel_id'},
      {name:'退室チャンネルID',value:'leave_channel_id'},
      {name:'チケットカテゴリID',value:'ticket_category_id'},
      {name:'サポートロールID',value:'ticket_support_role_id'},
      {name:'地震チャンネルID',value:'earthquake_channel_id'},
      {name:'天気チャンネルID',value:'weather_channel_id'}
    ))
    .addStringOption(o=>o.setName('value').setDescription('Discord ID').setRequired(true))),

  new SlashCommandBuilder().setName('x').setDescription('X新着通知設定')
    .addSubcommand(sc=>sc.setName('add').setDescription('【管理者】XプロフィールURLから新着投稿を自動通知')
    .addStringOption(o=>o.setName('url').setDescription('https://x.com/ユーザー名').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('通知先チャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('list').setDescription('【管理者】登録済みXアカウント一覧'))
    .addSubcommand(sc=>sc.setName('edit').setDescription('【管理者】X通知先チャンネルを変更')
    .addIntegerOption(o=>o.setName('id').setDescription('登録ID').setRequired(true))
    .addChannelOption(o=>o.setName('channel').setDescription('新しい通知先').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(sc=>sc.setName('remove').setDescription('【管理者】Xアカウントの監視を削除')
    .addIntegerOption(o=>o.setName('id').setDescription('登録ID').setRequired(true)))
    .addSubcommand(sc=>sc.setName('test').setDescription('【管理者】Xの最新投稿をテスト送信')
    .addIntegerOption(o=>o.setName('id').setDescription('登録ID').setRequired(true))),

  new SlashCommandBuilder().setName('media').setDescription('画像・動画検索データ')
    .addSubcommand(sc=>sc.setName('add').setDescription('【管理者】検索用の画像・動画URLを登録')
    .addStringOption(o=>o.setName('name').setDescription('名前').setRequired(true))
    .addStringOption(o=>o.setName('url').setDescription('画像・動画URL').setRequired(true))
    .addStringOption(o=>o.setName('tags').setDescription('タグ（空白またはカンマ区切り）'))
    .addStringOption(o=>o.setName('type').setDescription('種類').addChoices({name:'画像',value:'image'},{name:'動画',value:'video'})))
    .addSubcommand(sc=>sc.setName('search').setDescription('登録済み画像・動画を検索')
    .addStringOption(o=>o.setName('keyword').setDescription('名前・タグで検索').setRequired(true)))
    .addSubcommand(sc=>sc.setName('remove').setDescription('【管理者】検索用メディアを削除')
    .addIntegerOption(o=>o.setName('id').setDescription('メディアID').setRequired(true))),

  new SlashCommandBuilder().setName('social').setDescription('SNS最新情報設定')
    .addSubcommand(sc=>sc.setName('add').setDescription('【管理者】プロフィールURLからSNSを自動判定して最新情報を取得')
    .addStringOption(o=>o.setName('profile_url').setDescription('X / YouTube / Instagram のプロフィールURL').setRequired(true))
    .addStringOption(o=>o.setName('channel_url').setDescription('Discord投稿先チャンネルURL').setRequired(true)))
    .addSubcommand(sc=>sc.setName('remove').setDescription('【管理者】SNS最新情報ソースを削除')
    .addIntegerOption(o=>o.setName('id').setDescription('ソースID').setRequired(true)))
    .addSubcommand(sc=>sc.setName('list').setDescription('【管理者】SNS最新情報設定一覧'))
    .addSubcommand(sc=>sc.setName('test').setDescription('【管理者】SNS最新情報をテスト投稿')
    .addIntegerOption(o=>o.setName('id').setDescription('ソースID').setRequired(true))),

  new SlashCommandBuilder().setName('news').setDescription('ニュース自動通知')
    .addSubcommand(sc=>sc.setName('add').setDescription('【管理者】NEWS RSS/Atomソースと投稿先を追加')
    .addStringOption(o=>o.setName('name').setDescription('表示名').setRequired(true))
    .addStringOption(o=>o.setName('feed_url').setDescription('RSS/AtomフィードURL').setRequired(true))
    .addStringOption(o=>o.setName('channel_url').setDescription('DiscordチャンネルURL').setRequired(true)))
    .addSubcommand(sc=>sc.setName('remove').setDescription('【管理者】NEWSソースを削除')
    .addIntegerOption(o=>o.setName('id').setDescription('ソースID').setRequired(true)))
    .addSubcommand(sc=>sc.setName('list').setDescription('【管理者】NEWS設定一覧'))
    .addSubcommand(sc=>sc.setName('auto').setDescription('【管理者】NEWS自動通知ON/OFF')
    .addBooleanOption(o=>o.setName('enabled').setDescription('ON/OFF').setRequired(true)))
    .addSubcommand(sc=>sc.setName('test').setDescription('【管理者】NEWS最新記事をテスト送信')
    .addIntegerOption(o=>o.setName('id').setDescription('ソースID').setRequired(true))),

  new SlashCommandBuilder().setName('schedule').setDescription('予約投稿')
    .addSubcommand(sc=>sc.setName('post').setDescription('予約投稿')
    .addChannelOption(o=>o.setName('channel').setDescription('投稿先').setRequired(true).addChannelTypes(ChannelType.GuildText))
    .addStringOption(o=>o.setName('datetime').setDescription('例 2026-09-15 20:00').setRequired(true))
    .addStringOption(o=>o.setName('message').setDescription('本文').setRequired(true))
    .addIntegerOption(o=>o.setName('delete_after_minutes').setDescription('投稿後に削除する分数').setMinValue(1)))
    .addSubcommand(sc=>sc.setName('list').setDescription('予約投稿一覧'))
    .addSubcommand(sc=>sc.setName('cancel').setDescription('予約投稿削除')
    .addIntegerOption(o=>o.setName('id').setDescription('予約ID').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder().setName('moderation').setDescription('モデレーション設定')
    .addSubcommand(sc=>sc.setName('rule').setDescription('指定発言への自動処理ルール')
    .addStringOption(o=>o.setName('keyword').setDescription('検知語句').setRequired(true))
    .addStringOption(o=>o.setName('action').setDescription('処理').setRequired(true).addChoices(
      {name:'削除',value:'delete'},{name:'タイムアウト',value:'timeout'},{name:'Kick',value:'kick'},{name:'BAN',value:'ban'}
    )))
    .addSubcommand(sc=>sc.setName('list').setDescription('自動処理ルール一覧'))
    .addSubcommand(sc=>sc.setName('remove').setDescription('自動処理ルール削除')
    .addIntegerOption(o=>o.setName('id').setDescription('ルールID').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder().setName('music').setDescription('音楽再生・操作')
    .addSubcommand(sc=>sc.setName('play').setDescription('曲名またはURLから音楽を再生')
    .addStringOption(o=>o.setName('query').setDescription('曲名 / YouTube等のURL').setRequired(true)))
    .addSubcommand(sc=>sc.setName('queue').setDescription('現在のVCの音楽キュー'))
    .addSubcommand(sc=>sc.setName('skip').setDescription('現在曲をスキップ'))
    .addSubcommand(sc=>sc.setName('stop').setDescription('現在のVCの音楽停止'))
    .addSubcommand(sc=>sc.setName('pause').setDescription('音楽を一時停止'))
    .addSubcommand(sc=>sc.setName('resume').setDescription('音楽を再開'))
    .addSubcommand(sc=>sc.setName('nowplaying').setDescription('現在再生中を表示'))
    .addSubcommand(sc=>sc.setName('volume').setDescription('音量を変更')
    .addIntegerOption(o=>o.setName('percent').setDescription('音量 1〜200').setRequired(true).setMinValue(1).setMaxValue(200)))
    .addSubcommand(sc=>sc.setName('stats').setDescription('音楽の再生統計を表示')
    .addStringOption(o=>o.setName('type').setDescription('表示内容').addChoices({name:'よく聴いているユーザー',value:'users'},{name:'人気曲',value:'tracks'},{name:'全体',value:'all'})))
];
