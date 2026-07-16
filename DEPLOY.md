# Portside — setup & deployment (no coding needed)

This guide has two parts:

- **Part A** — get Portside running on your own computer.
- **Part B** — put it online with Vercel so you can share a link.

You will copy and paste a few values. You never have to write code.

---

## Part A — Run it on your computer

### A1. Open (or create) your Supabase project

1. Go to <https://supabase.com/dashboard> and sign in.
2. Open your existing project, or click **New project** and wait ~2 minutes for it
   to finish setting up.

### A2. Create the database tables

1. In the left sidebar, click **SQL Editor**.
2. Click **New query**.
3. Open the file `supabase/schema.sql` from this project, copy **all** of it, and
   paste it into the editor.
4. Click **Run** (bottom right). You should see "Success. No rows returned."

That one script creates the tables, the access-control rules, and the private file
bucket.

### A3. Collect three values from Supabase

In the left sidebar click the **gear icon (Project Settings)**, then gather these
three values. Copy each one somewhere temporary.

| # | What to copy | Where to find it |
| - | ------------ | ---------------- |
| 1 | **Project URL** | Project Settings → **Data API** → *Project URL* |
| 2 | **service_role key** | Project Settings → **API Keys** → *service_role* (marked secret) |
| 3 | **Connection string** | Project Settings → **Database** → *Connection string* → **Transaction pooler**. Replace `[YOUR-PASSWORD]` with your database password. |

Value #2 and value #3 are **secret** (value #3 contains your database password).
Don't paste them anywhere public. It's fine to paste them to me in this session so
I can create the local settings file for you.

### A4. Create the local settings file

Give me the three values from A3 and I will create the `.env.local` file for you.
(If you'd rather do it yourself: copy `.env.local.example` to `.env.local` and fill
in the three blanks.)

### A5. Install, seed, and run

I will run these for you:

```
npm install        # download the building blocks (one time)
npm run seed       # load the sample engagements + documents
npm run dev        # start the app
```

Then open **<http://localhost:3000>** in your browser. You should see the client
roster (Contoso Super, Fabrikam Health Network, Northwind Water Authority) — these
are placeholder names, not real companies.

**Try it:**
- Click **Contoso Super** in **EM View** — you'll see the Private Space, the
  Shared Space, and the Activity Log.
- Switch to **Client View** (top right). The Private Space and Activity Log
  disappear, and you can approve the pending document.

---

## Part B — Put it online with Vercel

### B1. The code is on GitHub

I will push this project to a GitHub repository under your account. (If you want to
do it yourself later, any push to GitHub works.)

### B2. Import into Vercel

1. Go to <https://vercel.com> and sign in **with GitHub**.
2. Click **Add New… → Project**.
3. Find the **portside-portfolio** repository and click **Import**.

### B3. Add the four settings in Vercel

Before clicking Deploy, open **Environment Variables** and add the same three
values from step A3. The names must match exactly:

| Name | Value |
| ---- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your service_role key |
| `DATABASE_URL` | your Transaction pooler connection string (with password) |

### B4. Deploy

Click **Deploy** and wait ~1 minute. Vercel gives you a public link like
`https://portside-portfolio-xxxx.vercel.app`. That is the link you can send.

Because your Vercel app talks to the **same** Supabase project you seeded in Part A,
your sample engagements are already there — no extra step needed.

---

## If something goes wrong

- **The app shows "setup needed" with a list of missing values** — a settings value
  is missing or misspelled. Re-check A4 (local) or B3 (Vercel).
- **Downloads or uploads fail** — the `service_role` key or the storage bucket is
  the usual cause. Confirm A2 ran successfully and key #3 is correct.
- **The app can't connect to the database** — the connection string (#3) or its
  password is wrong. Make sure you used the **Transaction pooler** string and
  replaced `[YOUR-PASSWORD]` with your real database password.

When in doubt, tell me exactly what you see and I'll diagnose it.
