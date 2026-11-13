# Go Vote

**Play: https://edazuki.github.io/go-vote/**

Red vs. Blue on the stars of a flag. A Go-based game (Pure Go rules): stones left on star points are votes, and the side with more votes wins. Runs in your browser on phones and PCs; play against the CPU or with a friend on one device.

A game themed on a fictional election; not affiliated with any real party or candidate. Game data is saved only in your browser (`localStorage`) and is never sent anywhere.

Licensed under [MIT No Attribution](LICENSE) (MIT-0): use it however you like, no credit required.

This is a personal project shared as-is. Issues and pull requests are not accepted, and no support is provided.

---

星条旗の星の部分（カントン）を盤にした、赤と青の陣取り。ルールは純碁ベース（盤上の石だけを数える）。
星の交点に残した石が票になり、終局時に票が多いほうの勝ち。ブラウザで遊ぶ（スマホ / PC 対応、いまはローカル対戦のみ）。

別に作っている「ドラフト囲碁」の部品（盤・ルール・CPU・描画・入力・効果音）を使い回している。

## 技術構成

- Vite + TypeScript（フレームワークなし）、描画は Canvas 2D、UI は素の DOM
- CPU：Web Worker（`?worker&inline` でビルド結果に埋め込む）
- テスト：Vitest
- 配布：`vite-plugin-singlefile` で `dist/index.html` 1枚

## コマンド

```sh
npm install
npm run dev        # 開発サーバ（--host 付き）
npm test           # ルール・星の配置・CPU・遊び方の手順のテスト
npm run build      # 型チェック + dist/index.html を生成
```

main に push すると GitHub Actions（`.github/workflows/pages.yml`）がビルドして GitHub Pages に出す。

## ディレクトリ

```
src/
  core/    盤（横 w × 縦 h）・ルール（game.ts）、星の配置と得票の集計（flag.ts）。DOM 非依存
  ai/      CPU。fastboard.ts（探索用の盤）、mcts.ts（つよい）、policy.ts（かんたん・ふつう）、worker.ts / client.ts
  render/  Canvas 描画（紺の布の盤・白い星・赤と青の石）
  ui/      入力・効果音・保存・遊び方
  setup.ts 上部の対局設定（盤・相手）
  main.ts  全体のつなぎ
```

## 仕様メモ（v0.1.0）

- 盤：格子の交点のうち、x + y が偶数の点が星。11×9 なら 6個と5個の段が交互に9段で、ちょうど50個（星条旗と同じ並び）
  - 盤は4種：★13（5×5）、★13 WIDE（7×7・外側に余白）、★50（11×9）、★50 WIDE（13×11・外側に余白）
  - 星13の盤は 3個と2個の段が交互に5段（3×3 + 2×2）。「外側に余白」は星のない列を1列ずつ足した盤
  - 得票率と過半数は、その盤の星の数で数える
- ルール：赤が先手。自殺手禁止、コウは即時の取り返しのみ禁止、パス2回で終局（同じ局面3回でも終局）
- 得票：終局時に盤に残った石のうち、星の交点にあるもの。多いほうの勝ち。コミは設定で 0〜10（整数、盤共通、初期値 0、次の対局から）。後手の票に足し、それでも同数なら後手の勝ち（半目）。半目は1票未満の票で（星の数 + コミ）÷ 673。分母に占める割合が常に 1/674（約 0.148%）なので、得票率（0.1% 刻み）で同数でも後手が上に見え、全部埋まれば合計 100.0% になる。得票率の分母は「星の数 + コミ + 半目」
- CPU（かんたん／ふつう／つよい）は「星の上の石を相手より多く盤上に残す」ことを目指す。交点の重みは星 1・それ以外 0（票にならない）
  - 勝負がついた局面では、自分の陣地の星でない点を埋める手や、狭い（6目以下）相手の陣地への放り込みはせずにパスする（取る手・アタリから逃げる手は打つ）
  - パスに切り替える基準は、相手がパスした直後（自分のパスで終局。パスの値が正確）とそれ以外で分けている（`src/ai/mcts.ts` の `PASS_RULE`）
  - ふつうも、自分の陣地の星でない点と、狭い相手の陣地には打たない
- 対局・設定は `localStorage` に保存（外部への送信はしない）
- 実在の政党・候補者の名前・ロゴ・肖像は使わない（架空の赤陣営と青陣営）
