# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - img "태그히어" [ref=e5]
      - heading "태그히어 CRM" [level=3] [ref=e6]
    - generic [ref=e7]:
      - generic [ref=e8]:
        - generic [ref=e9]: 로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.
        - generic [ref=e10]:
          - text: 이메일
          - textbox "owner@taghere.com" [ref=e11]: test@taghere.com
        - generic [ref=e12]:
          - text: 비밀번호
          - textbox "••••••••" [ref=e13]: testpassword123
        - button "로그인" [ref=e14] [cursor=pointer]
      - paragraph [ref=e16]:
        - text: 계정이 없으신가요?
        - link "회원가입" [ref=e17] [cursor=pointer]:
          - /url: /register
  - alert [ref=e18]
```