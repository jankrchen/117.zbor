# Trade Journal

Obchodný denník a analytika obchodov (inšpirované funkciami nástrojov ako TradesViz), postavené od nuly v React + TypeScript + Vite.
Všetky dáta zostávajú lokálne v prehliadači (localStorage).

## Funkcie

- **Import CSV** – automatické rozpoznanie stĺpcov (IBKR Flex / Activity Statement, všeobecné CSV, ďalšie brokery), deduplikácia podľa TradeID, manuálne zadanie exekúcie, záloha/obnova JSON, ukážkové dáta.
- **Skladanie obchodov** – exekúcie sa zoskupujú do round-trip obchodov (od nulovej pozície po nulovú), podpora scale-in/out, otočenia pozície (flip), long/short, multiplikátorov (opcie ×100, futures ES/NQ/MES/MNQ/CL/GC…).
- **Prehľad** – čistý P&L, úspešnosť, profit factor, očakávaná hodnota, payoff, max. drawdown, kumulatívny P&L, denný P&L, drawdown graf, série, priemerné držanie, R-násobky.
- **Obchody** – triediteľná tabuľka, stránkovanie, export CSV.
- **Kalendár** – mesačná heatmapa denného P&L s týždennými súčtami a obchodmi daného dňa.
- **Reporty** – výkonnosť podľa symbolu, dňa v týždni, hodiny, mesiaca, smeru, dĺžky držania, ceny, triedy aktív, štítku a účtu.
- **Detail obchodu** – cenový graf (sviečky) so šípkami pri každej exekúcii a čiarami priemerného vstupu/výstupu, exekúcie, štítky, poznámky, hodnotenie, plánované riziko (R).
- **Filtre** – dátum (7D/30D/90D/YTD), symbol, smer, výsledok, účet, štítok, otvorené pozície.

## Cenové grafy

Detail obchodu zobrazuje sviečkový graf (Lightweight Charts) s vyznačenými nákupmi/predajmi.
- Ceny sa sťahujú cez lokálny server z verejného chart endpointu **Yahoo Finance** (bez API kľúča, len čítanie). Je to neoficiálne rozhranie určené na osobné použitie.
- Interval sviečok sa volí podľa veku a dĺžky obchodu (1m ≈ posledných 30 dní, 5m/15m ≈ 60 dní, 1h ≈ 2 roky, inak 1d), dá sa prepnúť ručne.
- Časové pásmo časov od brokera sa nastavuje priamo v grafe (predvolene America/New_York).
- Futures používajú priebežný kontrakt (napr. `MES=F`), opcie OCC symbol. Symbol pre graf sa dá pri obchode prepísať (napr. `SAP.DE`).
- Pri ukážkových dátach sú sviečky simulované.

## Automatické prepojenie s IBKR (len čítanie)

Aplikácia sa vie sama synchronizovať s Interactive Brokers cez **Flex Web Service**:
pri spustení a potom v nastavenom intervale (predvolene 30 min) stiahne exekúcie a pridá nové do denníka (duplicity sa preskočia podľa Trade ID).

**Bezpečnosť**
- Flex token vie **iba sťahovať výkazy**. Nedá sa ním obchodovať, presúvať peniaze ani sa prihlásiť do účtu.
- Token je len v súbore `.env` (je v `.gitignore`) a číta ho iba lokálny server. Nikdy nie je v prehliadači ani v builde.
- Server počúva iba na `127.0.0.1`, vyžaduje vlastnú hlavičku a localhost `Host` (ochrana pred CSRF / DNS rebinding).
- Token sa posiela len cez HTTPS na `*.interactivebrokers.com`. Ak by IBKR vrátil inú adresu, požiadavka sa zablokuje.
- Chybové hlášky sa pred zobrazením očistia od tokenu. Synchronizácia je obmedzená na max. 1× za minútu.
- Odporúčanie: v IBKR obmedz token na svoju IP adresu a nastav mu krátku platnosť.

**Nastavenie**
1. IBKR Portal → *Performance & Reports → Flex Queries*.
2. Vytvor **Trade Confirmation Flex Query** (dnešné obchody počas dňa) a/alebo **Activity Flex Query** (história). V *Trades* zvoľ *Executions*, formát **XML**.
3. *Flex Web Service Configuration* → zapni a vygeneruj token.
4. `cp .env.example .env` a doplň `IBKR_FLEX_TOKEN` a `IBKR_FLEX_QUERY_IDS` (viac ID oddeľ čiarkou).
5. `npm run dev` (alebo `npm run build && npm start`).

## Spustenie

```bash
npm install
npm run dev      # vývojový server
npm test         # unit testy (parser, skladanie obchodov, štatistiky)
npm run build    # produkčný build do dist/
npm start        # produkčný server na http://localhost:5174 (vyžaduje Node ≥ 22.18)
```
