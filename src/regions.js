export const PREFECTURES = [
  ["北海道","札幌市"],["青森県","青森市"],["岩手県","盛岡市"],["宮城県","仙台市"],["秋田県","秋田市"],["山形県","山形市"],["福島県","福島市"],
  ["茨城県","水戸市"],["栃木県","宇都宮市"],["群馬県","前橋市"],["埼玉県","さいたま市"],["千葉県","千葉市"],["東京都","新宿区"],["神奈川県","横浜市"],
  ["新潟県","新潟市"],["富山県","富山市"],["石川県","金沢市"],["福井県","福井市"],["山梨県","甲府市"],["長野県","長野市"],
  ["岐阜県","岐阜市"],["静岡県","静岡市"],["愛知県","名古屋市"],["三重県","津市"],["滋賀県","大津市"],["京都府","京都市"],["大阪府","大阪市"],
  ["兵庫県","神戸市"],["奈良県","奈良市"],["和歌山県","和歌山市"],["鳥取県","鳥取市"],["島根県","松江市"],["岡山県","岡山市"],["広島県","広島市"],
  ["山口県","山口市"],["徳島県","徳島市"],["香川県","高松市"],["愛媛県","松山市"],["高知県","高知市"],["福岡県","福岡市"],["佐賀県","佐賀市"],
  ["長崎県","長崎市"],["熊本県","熊本市"],["大分県","大分市"],["宮崎県","宮崎市"],["鹿児島県","鹿児島市"],["沖縄県","那覇市"]
];

export const WEATHER_AREAS = {
  "北海道地方": ["北海道"],
  "東北地方": ["青森県","岩手県","宮城県","秋田県","山形県","福島県"],
  "関東地方": ["茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県"],
  "中部地方": ["新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県"],
  "近畿地方": ["三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県"],
  "中国地方": ["鳥取県","島根県","岡山県","広島県","山口県"],
  "四国地方": ["徳島県","香川県","愛媛県","高知県"],
  "九州地方": ["福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県"],
  "沖縄地方": ["沖縄県"],
  "九州・沖縄地方": ["福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"]
};

export const ALL_PREFECTURE_NAMES = PREFECTURES.map(([pref]) => pref);

export function expandWeatherRegion(value) {
  if (value === "全国47都道府県") return [...ALL_PREFECTURE_NAMES];
  if (WEATHER_AREAS[value]) return [...WEATHER_AREAS[value]];

  const pref = PREFECTURES.find(([p, capital]) => p === value || capital === value);
  return pref ? [pref[0]] : [];
}

export function searchRegionChoices(input = "") {
  const q = input.trim().toLowerCase();

  const areaChoices = [
    { name: "全国47都道府県", value: "全国47都道府県" },
    ...Object.keys(WEATHER_AREAS).map(area => ({ name: area, value: area }))
  ];

  const prefChoices = PREFECTURES.map(([pref, capital]) => ({
    name: `${pref}（${capital}）`,
    value: pref
  }));

  const all = [...areaChoices, ...prefChoices];

  // Discord autocomplete is limited to 25 results.
  // Empty input: show regional shortcuts + first prefectures.
  // Typed input: search across all 47 prefectures and every regional shortcut.
  const filtered = q
    ? all.filter(x =>
        x.name.toLowerCase().includes(q) ||
        x.value.toLowerCase().includes(q)
      )
    : all;

  return filtered.slice(0, 25);
}


export function searchPrefectureChoices(input = "") {
  const q = input.trim().toLowerCase();
  const all = PREFECTURES.map(([pref, capital]) => ({
    name: `${pref}（${capital}）`,
    value: pref
  }));
  return (q
    ? all.filter(x => x.name.toLowerCase().includes(q) || x.value.toLowerCase().includes(q))
    : all
  ).slice(0, 25);
}
