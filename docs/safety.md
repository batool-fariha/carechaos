# Safety, privacy and scope

* **Simulation only.** CareChaos models a pipeline; it connects to nothing.
* **Synthetic data only.** Patient IDs (`SYN-P001`), device IDs (`SYN-D001`) and values are generated from a seeded PRNG. Nothing is read from any real system.
* **Not medical advice.** Alert thresholds (heart rate > 120 bpm, SpO₂ < 90 %, systolic > 160 mmHg) are illustrative demo values, not validated clinical thresholds. The tool never produces clinical recommendations.
* **No compliance claims.** Using synthetic IDs or local storage does not make this project compliant with HIPAA, GDPR, the EU MDR or anything else.
* **Passing ≠ safe.** A green experiment shows that a *modelled* behavior held under *modelled* conditions. It does not establish clinical safety.
* **Faulty mode is a teaching device,** not a depiction of any company's infrastructure.
* **Local storage.** Experiment history (configs and summaries only) is stored in a local SQLite file you can delete from Settings.
