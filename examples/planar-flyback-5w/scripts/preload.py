"""Preload current and thermal screens; not a burst-mode or lifetime model."""


def preload_budget(part, targets, inductance_max_H):
    resistance = part['resistance_ohm']
    tolerance = part['tolerance_fraction']
    temperature_delta = targets['preload_resistor_temperature_excursion_assumption_C']
    drift = part['tcr_ppm_per_C'] * 1e-6 * temperature_delta
    aging = targets['preload_resistor_aging_reserve_fraction']
    assert resistance > 0 and inductance_max_H > 0
    assert all(0 <= v < 1 for v in [tolerance, drift, aging])
    rmax = resistance * (1+tolerance) * (1+drift) * (1+aging)
    rmin = resistance * (1-tolerance) * (1-drift) * (1-aging)
    # ADI LT8302 Rev G p17: maximum minimum-current/frequency limits.
    required = inductance_max_H * 1.04**2 * 12700 / (2*4.75)
    minimum = 4.75 / rmax
    power = 5.25**2 / rmin
    ambient = targets['preload_local_ambient_screen_C']
    rated = part['power_rating_W_at_70C'] * max(0, min(1,
        (part['zero_power_ambient_C']-ambient)/(part['zero_power_ambient_C']-70)))
    assert rated > 0
    return {
        'resistance_ohm': resistance,
        'initial_tolerance_fraction': tolerance,
        'temperature_excursion_C': temperature_delta,
        'TCR_fraction': drift,
        'aging_reserve_fraction': aging,
        'maximum_resistance_ohm': rmax,
        'minimum_resistance_ohm': rmin,
        'nominal_current_at_5V_A': 5/resistance,
        'nominal_power_at_5V_W': 25/resistance,
        'required_minimum_load_A': required,
        'minimum_current_A': minimum,
        'current_margin_fraction': minimum/required-1,
        'maximum_power_W': power,
        'local_ambient_screen_C': ambient,
        'derated_rating_W': rated,
        'derated_power_fraction': power/rated,
        'scope': '4.75-5.25 V, Lm maximum acceptance, specified 1.04 A / 12.7 kHz limits. TCR and aging are multiplicative reserves. Aging reserve is not lifetime qualification; measure no-load regulation and local temperature.'
    }
