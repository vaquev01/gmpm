# GMPM Frontend Audit

## BUGS
1. ScannerView:1 - useEffect imported unused
2. MicroView:366 - failureCount unused
3. ScannerView:287 - macroScore hardcoded=60
4. Shell:100 - ONLINE always green even if backend down
5. useApi.ts MarketAsset has category, views use assetClass

## DRY VIOLATIONS
6. ALL 11 views define local hooks instead of importing useApi.ts
7. Duplicate queryKeys: macro/meso/regime used in multiple views with different types
8. useApi.ts hooks are completely unused - dead code

## DATA FLOW
9. IncubatorView builds FAKE positions from MESO data - misleading
10. SignalOutputView signals are just reformatted MESO instruments
11. 6 endpoints rely on legacy proxy: meso,micro,currency-strength,liquidity-map,risk,lab
12. /api/server-logs exists but no frontend uses it
13. LabView makes 2+6 sequential API calls - very slow

## NAVIGATION
14. react-router-dom installed but UNUSED - no URL routing
15. No bookmarks, no back/forward, refresh resets to Dashboard
16. No keyboard shortcuts

## UI/UX
17. globals.css light mode vars are dead code (app hardcodes dark)
18. No loading skeletons - just spinners
19. No toast/notifications for actions
20. No data export (CSV/clipboard)
21. Scanner detail panel hidden on mobile (hidden lg:block)
22. No preferences persistence (filters/radar reset on refresh)
23. ErrorBoundary retry doesn't refetch queries
24. No favicon or meta description in index.html

## PERFORMANCE
25. No list virtualization for Scanner (50+ rows)
26. getExecWindow() recalculates every render
27. No websocket/SSE - all polling

## MISSING
28. Shared hooks for meso/micro/currency/liquidity/risk/lab
29. Real-time health status in Shell header
30. URL-based routing with react-router-dom
31. Dev logs viewer panel (backend has server-logs)
32. Regime integration into Scanner trustScore
