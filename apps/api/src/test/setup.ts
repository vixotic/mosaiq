process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgres://example.invalid/test";
process.env.WEB_ORIGIN ||= "http://127.0.0.1:5173";
process.env.AUTH_OWNER_USERNAME ||= "owner";
process.env.AUTH_OWNER_PASSWORD_HASH ||=
  "$argon2id$v=19$m=65536,p=4,t=3$MWtmpPJEUpQO9xIuiCySRg$9rDgxHyMMJG5hifHhYC/ZctuWkwM5CxxiaYAHz5OUj4";
