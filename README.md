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
- **Detail obchodu** – exekúcie, štítky, poznámky, hodnotenie, plánované riziko (R).
- **Filtre** – dátum (7D/30D/90D/YTD), symbol, smer, výsledok, účet, štítok, otvorené pozície.

## Spustenie

```bash
npm install
npm run dev      # vývojový server
npm test         # unit testy (parser, skladanie obchodov, štatistiky)
npm run build    # produkčný build do dist/
```
