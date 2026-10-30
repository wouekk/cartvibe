// Creates the two accounts the e2e suite signs in with, through the API of a fresh database (the first start makes
// admin / admin). Idempotent: an account that already exists is left alone.
//
//   node e2e/seed-accounts.mjs            (E2E_* variables as in api/dev/switch-to-sqlite.sh; API_URL defaults to
//                                          http://localhost:8081)
const api = (process.env.API_URL ?? "http://localhost:8081") + "/api";
const required = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set (source api/dev/switch-to-sqlite.sh, or set the E2E_* variables).`);
    process.exit(1);
  }
  return value;
};

const accounts = [
  { username: required("E2E_ADMIN_USERNAME"), password: required("E2E_ADMIN_PASSWORD"), displayName: "E2E Admin", role: "Legacy Admin" },
  { username: required("E2E_USER_USERNAME"), password: required("E2E_USER_PASSWORD"), displayName: "E2E User", role: "Legacy User" },
];

async function call(token, method, path, body) {
  const response = await fetch(api + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

async function signIn(username, password) {
  const login = await fetch(`${api}/login/?tokensInBody=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) {
    throw new Error(`Signing in as ${username} failed (${login.status}); is this a fresh database?`);
  }
  return (await login.json()).jwt;
}

const jwt = await signIn(process.env.SEED_ADMIN_USERNAME ?? "admin", process.env.SEED_ADMIN_PASSWORD ?? "admin");

const roles = await call(jwt, "GET", "/role");
const users = await call(jwt, "GET", "/user");

for (const account of accounts) {
  if (users.some((user) => user.username === account.username)) {
    console.log(`${account.username} exists`);
    continue;
  }
  const role = roles.find((r) => r.name === account.role && r.scope === "APP");
  if (!role) {
    throw new Error(`No app role named ${account.role}; found ${roles.map((r) => r.name).join(", ")}`);
  }
  await call(jwt, "POST", "/user", {
    username: account.username,
    password: account.password,
    displayName: account.displayName,
    isDummyUser: false,
    appRoleId: role.id,
  });
  console.log(`${account.username} created as ${account.role}`);
}

// A new account is greeted with a welcome dialog that covers the page; the specs would have to dismiss it first.
for (const account of accounts) {
  const token = await signIn(account.username, account.password);
  const preferences = await call(token, "GET", "/userPreferences");
  if (preferences.onboardingPending) {
    await call(token, "PUT", "/userPreferences", { ...preferences, onboardingPending: false });
    console.log(`${account.username}: welcome dialog switched off`);
  }
}
