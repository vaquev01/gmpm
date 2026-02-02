from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class MesoAnalyzer:
    max_drivers: int = 5

    def analyze(self, macro_snapshot: Dict[str, Any]) -> Dict[str, Any]:
        now = datetime.now()
        flat = macro_snapshot.get('flat', {}) or {}
        derived = macro_snapshot.get('derived', {}) or {}
        features = macro_snapshot.get('features', {}) or {}
        raw_latest = macro_snapshot.get('raw_latest', {}) or {}
        ts = macro_snapshot.get('timeseries', {}) or {}

        staleness_days = self._compute_staleness_days(raw_latest, now)

        daily = {}
        for key in [
            'VIX',
            'HY_SPREAD',
            'YIELD_CURVE_10Y2Y',
            'DOLLAR_INDEX',
            'TREASURY_10Y',
            'FINANCIAL_STRESS_INDEX',
            'NFCI',
            'ANFCI',
            'SP500',
            'WTI_OIL',
            'COPPER',
            'GOLD',
        ]:
            if key not in ts:
                continue
            item = self._summarize_timeseries(ts.get(key))
            if not item:
                continue

            if key == 'HY_SPREAD':
                v = item.get('value')
                if isinstance(v, (int, float)):
                    item['value_bps'] = float(v * 100.0) if v < 50 else float(v)
                for ch_key in ['change_1d', 'change_1w', 'change_1m']:
                    ch = item.get(ch_key)
                    if isinstance(ch, (int, float)):
                        item[f'{ch_key}_bps'] = float(ch * 100.0) if v is not None and v < 50 else float(ch)

            daily[key] = item

        alerts = self._build_alerts(flat, derived, features, staleness_days)
        drivers = self._build_drivers(flat, derived, daily, features)

        return {
            'timestamp': now.isoformat(),
            'staleness_days': staleness_days,
            'daily': daily,
            'drivers': drivers[: self.max_drivers],
            'alerts': alerts,
        }

    def _compute_staleness_days(self, raw_latest: Dict[str, Any], now: datetime) -> Dict[str, Optional[int]]:
        out: Dict[str, Optional[int]] = {}
        for k, v in raw_latest.items():
            if not isinstance(v, dict):
                continue
            asof = v.get('asof')
            if not asof:
                out[k] = None
                continue
            dt = self._parse_date(asof)
            if dt is None:
                out[k] = None
                continue
            out[k] = int((now.date() - dt.date()).days)
        return out

    def _parse_date(self, s: Any) -> Optional[datetime]:
        if not isinstance(s, str):
            return None
        try:
            if len(s) == 10:
                return datetime.fromisoformat(s)
            return datetime.fromisoformat(s.replace('Z', '+00:00'))
        except Exception:
            return None

    def _summarize_timeseries(self, series: Any) -> Optional[Dict[str, Any]]:
        points = self._parse_timeseries(series)
        if len(points) < 2:
            return None

        last_dt, last_v = points[-1]
        prev_1d = self._value_at_or_before(points, last_dt - timedelta(days=1))
        prev_1w = self._value_at_or_before(points, last_dt - timedelta(days=7))
        prev_1m = self._value_at_or_before(points, last_dt - timedelta(days=30))

        out: Dict[str, Any] = {
            'asof': last_dt.date().isoformat(),
            'value': float(last_v),
        }

        out['change_1d'] = float(last_v - prev_1d) if prev_1d is not None else None
        out['change_1w'] = float(last_v - prev_1w) if prev_1w is not None else None
        out['change_1m'] = float(last_v - prev_1m) if prev_1m is not None else None

        if prev_1d is not None and prev_1d != 0:
            out['pct_change_1d'] = float((last_v / prev_1d - 1.0) * 100.0)
        else:
            out['pct_change_1d'] = None

        if prev_1w is not None and prev_1w != 0:
            out['pct_change_1w'] = float((last_v / prev_1w - 1.0) * 100.0)
        else:
            out['pct_change_1w'] = None

        if prev_1m is not None and prev_1m != 0:
            out['pct_change_1m'] = float((last_v / prev_1m - 1.0) * 100.0)
        else:
            out['pct_change_1m'] = None

        return out

    def _parse_timeseries(self, series: Any) -> List[Tuple[datetime, float]]:
        if not isinstance(series, list):
            return []

        out: List[Tuple[datetime, float]] = []
        for item in series:
            if not isinstance(item, dict):
                continue
            dt = self._parse_date(item.get('date'))
            v = item.get('value')
            if dt is None or not isinstance(v, (int, float)):
                continue
            out.append((dt, float(v)))

        out.sort(key=lambda x: x[0])
        return out

    def _value_at_or_before(self, points: List[Tuple[datetime, float]], target: datetime) -> Optional[float]:
        if not points:
            return None

        for dt, v in reversed(points):
            if dt <= target:
                return float(v)

        return float(points[0][1]) if points else None

    def _build_alerts(
        self,
        flat: Dict[str, Any],
        derived: Dict[str, Any],
        features: Dict[str, Any],
        staleness_days: Dict[str, Optional[int]],
    ) -> List[Dict[str, Any]]:
        alerts: List[Dict[str, Any]] = []

        macro_stress = flat.get('macro_stress')
        if isinstance(macro_stress, (int, float)) and macro_stress >= 75:
            alerts.append({'id': 'macro_stress_high', 'level': 'HIGH', 'value': float(macro_stress)})

        vix = flat.get('vix')
        if isinstance(vix, (int, float)) and vix >= 30:
            alerts.append({'id': 'vix_elevated', 'level': 'HIGH', 'value': float(vix)})
        elif isinstance(vix, (int, float)) and vix >= 22:
            alerts.append({'id': 'vix_watch', 'level': 'MEDIUM', 'value': float(vix)})

        credit_spread = flat.get('credit_spread')
        if isinstance(credit_spread, (int, float)) and credit_spread >= 500:
            alerts.append({'id': 'credit_spread_stressed', 'level': 'HIGH', 'value_bps': float(credit_spread)})
        elif isinstance(credit_spread, (int, float)) and credit_spread >= 350:
            alerts.append({'id': 'credit_spread_widening', 'level': 'MEDIUM', 'value_bps': float(credit_spread)})

        yield_curve = flat.get('yield_curve')
        if isinstance(yield_curve, (int, float)) and yield_curve < 0:
            alerts.append({'id': 'yield_curve_inverted', 'level': 'MEDIUM', 'value': float(yield_curve)})

        for k, days in staleness_days.items():
            if isinstance(days, int) and days >= 45 and k in {'CPI', 'CORE_CPI'}:
                alerts.append({'id': 'inflation_data_stale', 'level': 'LOW', 'series': k, 'staleness_days': days})

        cs_z = derived.get('credit_spread_zscore_2y')
        if isinstance(cs_z, (int, float)) and cs_z >= 1.5:
            alerts.append({'id': 'credit_spread_zscore_high', 'level': 'MEDIUM', 'zscore': float(cs_z)})

        vix_z = derived.get('vix_zscore_2y')
        if isinstance(vix_z, (int, float)) and vix_z >= 1.5:
            alerts.append({'id': 'vix_zscore_high', 'level': 'MEDIUM', 'zscore': float(vix_z)})

        fsi_z = derived.get('financial_stress_zscore_2y')
        if isinstance(fsi_z, (int, float)) and fsi_z >= 1.5:
            alerts.append({'id': 'financial_stress_zscore_high', 'level': 'HIGH', 'zscore': float(fsi_z)})

        nfci_z = derived.get('nfci_zscore_2y')
        if isinstance(nfci_z, (int, float)) and nfci_z >= 1.5:
            alerts.append({'id': 'nfci_zscore_high', 'level': 'HIGH', 'zscore': float(nfci_z)})

        spx = self._safe_float(flat.get('SP500'))
        if spx is not None:
            spx_1w = self._safe_float(derived.get('SP500_pct_change_1m'))
            if spx_1w is not None and spx_1w <= -6:
                alerts.append({'id': 'sp500_drawdown', 'level': 'HIGH', 'pct_change_1m': float(spx_1w)})

        wti_1m = self._safe_float(derived.get('WTI_OIL_pct_change_1m'))
        if wti_1m is not None and wti_1m >= 15:
            alerts.append({'id': 'oil_spike', 'level': 'MEDIUM', 'pct_change_1m': float(wti_1m)})

        return alerts

    def _safe_float(self, v: Any) -> Optional[float]:
        try:
            if v is None:
                return None
            return float(v)
        except Exception:
            return None

    def _build_drivers(
        self,
        flat: Dict[str, Any],
        derived: Dict[str, Any],
        daily: Dict[str, Any],
        features: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        drivers: List[Dict[str, Any]] = []

        def add(name: str, score: float, payload: Dict[str, Any]):
            drivers.append({'name': name, 'score': float(score), **payload})

        macro_stress = flat.get('macro_stress')
        if isinstance(macro_stress, (int, float)):
            add('macro_stress', float(macro_stress), {'value': float(macro_stress)})

        cs_z = derived.get('credit_spread_zscore_2y')
        if isinstance(cs_z, (int, float)):
            add('credit_spread_zscore_2y', float(min(100.0, max(0.0, 50.0 + cs_z * 20.0))), {'zscore': float(cs_z)})

        vix_z = derived.get('vix_zscore_2y')
        if isinstance(vix_z, (int, float)):
            add('vix_zscore_2y', float(min(100.0, max(0.0, 50.0 + vix_z * 20.0))), {'zscore': float(vix_z)})

        yc_z = derived.get('yield_curve_zscore_2y')
        if isinstance(yc_z, (int, float)):
            add('yield_curve_zscore_2y', float(min(100.0, max(0.0, 50.0 - yc_z * 15.0))), {'zscore': float(yc_z)})

        usd_strength = features.get('macro_usd_strength')
        if isinstance(usd_strength, (int, float)):
            add('usd_strength', float(usd_strength), {'value': float(usd_strength)})

        vix_daily = daily.get('VIX')
        if isinstance(vix_daily, dict):
            ch = vix_daily.get('change_1w')
            if isinstance(ch, (int, float)):
                add('vix_change_1w', float(min(100.0, max(0.0, 50.0 + ch * 5.0))), {'change_1w': float(ch)})

        cs_daily = daily.get('HY_SPREAD')
        if isinstance(cs_daily, dict):
            ch = cs_daily.get('change_1w_bps')
            if isinstance(ch, (int, float)):
                add('credit_spread_change_1w', float(min(100.0, max(0.0, 50.0 + ch * 0.2))), {'change_1w_bps': float(ch)})

        fsi_z = derived.get('financial_stress_zscore_2y')
        if isinstance(fsi_z, (int, float)):
            add('financial_stress_zscore_2y', float(min(100.0, max(0.0, 50.0 + fsi_z * 20.0))), {'zscore': float(fsi_z)})

        nfci_z = derived.get('nfci_zscore_2y')
        if isinstance(nfci_z, (int, float)):
            add('nfci_zscore_2y', float(min(100.0, max(0.0, 50.0 + nfci_z * 20.0))), {'zscore': float(nfci_z)})

        spx_daily = daily.get('SP500')
        if isinstance(spx_daily, dict):
            ch = spx_daily.get('pct_change_1w')
            if isinstance(ch, (int, float)):
                add('sp500_pct_change_1w', float(min(100.0, max(0.0, 50.0 - ch * 2.0))), {'pct_change_1w': float(ch)})

        wti_daily = daily.get('WTI_OIL')
        if isinstance(wti_daily, dict):
            ch = wti_daily.get('pct_change_1w')
            if isinstance(ch, (int, float)):
                add('wti_pct_change_1w', float(min(100.0, max(0.0, 50.0 + ch * 2.0))), {'pct_change_1w': float(ch)})

        drivers.sort(key=lambda x: x.get('score', 0.0), reverse=True)
        return drivers
