# プロジェクト用スキル置き場

このフォルダにカスタムスキルを追加すると、Claude Code がこのプロジェクトで自動的に認識します。

## 作り方

```
.claude/skills/<スキル名>/SKILL.md
```

`SKILL.md` の先頭に frontmatter で名前と説明を書きます:

```markdown
---
name: skill-name
description: いつこのスキルを使うべきかを具体的に書く（Claude はこの説明を見て自動起動するか判断する）
---

ここに実行時の指示を書く。
```

必要であれば同じフォルダに補助スクリプトやテンプレートファイルを追加してもよい。

## 使い方

会話中に `/skill-name` と入力するか、`description` に合致する状況で Claude が自動的に読み込みます。
