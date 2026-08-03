# Pre-submission wording, claim–code, and revision audit

Check: Treat `RTR_and_paper/original_arxiv_upload/` as the prior `arxiv_upload/`, because no other `arxiv_upload/` directory is present.

Check: Review the annotated addition-highlighted PDF at [`output/pdf/bioeth_prs_revision_diff.pdf`](../../output/pdf/bioeth_prs_revision_diff.pdf); use the old/new quotations below for deletions whose full red markup made wide tables overflow.

## 1. Wording edits

### `RTR_and_paper/final_arxiv_upload/bioeth_prs.tex`

| File:line | Current text | Suggested text | Reason (≤10 words) |
|---|---|---|---|
| `bioeth_prs.tex:82–87` | “calculations and decrypt results for the intended requester” | “calculations and decrypt raw-score results for the intended requester; randomized categories are publicly decryptable” | Distinguish the two release paths. |
| `bioeth_prs.tex:149–150` | “Published polygenic scores in the PGS Catalog range from small panels to genome-wide scores with large variant sets \citep{lambert2019polygenic}.” | Keep the sentence, but restore the PGS Catalog article under this key. | Current entry cites a different review. |
| `bioeth_prs.tex:155–158` | “Two kinds of sensitive information. Two kinds of sensitive information require…” | “Protecting genotypes and model weights. The system handles two kinds of sensitive information…” | Avoid immediate heading repetition. |
| `bioeth_prs.tex:166` | “Knight et al.\ \citep{knight2026heprs} demonstrate…” | “\citet{knight2026heprs} demonstrate…” | Use textual citation for sentence subject. |
| `bioeth_prs.tex:220–226` | “Effect weights are typically … in the range $[-0.5,+0.5]$.” | “In the evaluated fixtures, effect weights lie in $[-M,M]$, where $M$ is the largest absolute fixture weight.” | Avoid an unsupported universal range. |
| `bioeth_prs.tex:237–269` | “bioETH-PRS scores one individual…” | “The preprocessing workflow scores one individual…” | Checks are in the reference workflow, not contracts. |
| `bioeth_prs.tex:303–306` | “only the intended requester can decrypt it” | “the intended requester can decrypt a raw score authorized by the contract; a randomized category is publicly decryptable” | Match `makePubliclyDecryptable`. |
| `bioeth_prs.tex:320–324` | “the Model contract … the Calculation contract … the Result contract” | “`ModelMarketplace` … `PRSComputeEngine` … `ResultOracle`” after first definition | Match artifact names globally. |
| `bioeth_prs.tex:324` | “Separating these roles makes the responsibility of each contract clear.” | “Each contract therefore has one primary role: registration, model publication, score calculation, or category release.” | State the property directly. |
| `bioeth_prs.tex:329–333` | “Results are released only to the intended requester.” | “Raw scores are ACL-granted only to the requester; randomized categories are publicly decryptable.” | Current sentence is too broad. |
| `bioeth_prs.tex:347` | “Models cannot be changed after publication.” | “Weights, quantization parameters, and release policy are immutable after finalization; the owner may update rate limits.” | State the implemented mutability boundary. |
| `bioeth_prs.tex:354–355` | “releases one result” | “finalizes one raw score or one randomized category” | Name the mutually exclusive final paths. |
| `bioeth_prs.tex:358–360` | “The random value … is not known before the transaction is mined.” | “The contract obtains a bounded random encrypted value from `FHE.randEuint64`; its unpredictability is an fhEVM-service assumption.” | Separate code behavior from service assumption. |
| `bioeth_prs.tex:426–429` | “order used in the implementation” | “order used by `_encodeFinalScore`; update the TypeScript advisor to use the same tie rule” | Advisor differs on negative half ties. |
| `bioeth_prs.tex:585–588` | “$s\in\{10^2,10^4,10^6,10^8,10^{10}\}$” | “$s\in\{10^2,3\!\times\!10^2,10^3,3\!\times\!10^3,10^4,3\!\times\!10^4,10^5,3\!\times\!10^5,10^6,3\!\times\!10^6,10^7\}$” | Match `DEFAULT_SCALES`. |
| `bioeth_prs.tex:594` | “1–15% MAE in these data” | “MAE of 0.012–0.150 PRS units in these data” | Evidence records absolute, not percentage, error. |
| `bioeth_prs.tex:598–599` | “Higher scale ($s\approx10^8$)” | “Higher evaluated scale ($s=10^7$)” | $10^8$ is not evaluated by default. |
| `bioeth_prs.tex:602–604` | “This calculation takes approximately 200 ms…” | “Run the advisor before model publication; report its measured runtime, hardware, and command in the artifact.” | No advisor timing record was found. |
| `bioeth_prs.tex:603` | “The scale does not change gas use” | “For this fixed-`euint64` implementation, changing scale without changing integer width does not change the contract operation count.” | Qualify the implementation-specific claim. |
| `bioeth_prs.tex:641–643` | “which explains the observed 35.4–37.2% reduction” | “The implementation omits two permanent records per SNP; the measured total reduction was 35.4–37.2%.” | Separate mechanism from measured effect. |
| `bioeth_prs.tex:703` | “decrypt results only for the intended requester” | “decrypt ACL-gated raw scores for the requester; serve public category decryption” | Reflect both service roles. |
| `bioeth_prs.tex:720` | “Each calculation releases one result…” | “Each completed job finalizes one result; separately, `readPartial` can expose an intermediate accumulator when oracle release is not required.” | Document the additional read path. |
| `bioeth_prs.tex:822–825` | “Sepolia provides observed fhEVM transaction results.” | “We measured one public-weight calculation on Sepolia; the local simulation measured contract behavior and gas.” | Use past tense for measurements. |
| `bioeth_prs.tex:929–931` | “Original gas-scaling visualization… retains the original plotted values” | “Gas used by the Classic and Streaming methods in the local simulation; Table X contains the same measured values.” | Figure and table should share data. |
| `bioeth_prs.tex:1046–1049` | “shows agreement … it is not a guarantee” | “agreed for all 200 studied inputs; this comparison does not prove correctness for other models, inputs, or deployments” | State result and limit directly. |
| `bioeth_prs.tex:1063` | “release the result to the intended requester” | “perform encrypted operations and apply fhEVM decryption permissions” | Category release is public. |
| `bioeth_prs.tex:1070–1073` | “allow only one result per calculation” | “allow one finalized result per job; account separately for `readPartial`” | Match the callable interface. |
| `bioeth_prs.tex:1121` | “HEPRS reports encrypted PRS calculation” | “HEPRS reports an encrypted PRS calculation” | Add missing article. |
| `bioeth_prs.tex:1179–1187` | “Kim and Lauter \citep… Blatt et al.\ \citep… McLaren et al.\ \citep… Raisaro et al.\ \citep…” | “\citet{kim2015}… \citet{blatt2020}… \citet{mclaren2016}… \citet{raisaro2019}…” | Use textual citations for subjects. |
| `bioeth_prs.tex:1193–1195` | “builds directly on the HEPRS computational framework” | “uses the HEPRS study fixtures and the same additive PRS definition” | No imported HEPRS implementation was found. |
| `bioeth_prs.tex:1242` | “No new datasets were generated or analyzed in this study.” | “No new datasets were generated. We analyzed the public HEPRS fixtures retained under `test/fixtures/heprs/` and report the derived records under `evidence/`.” | Current sentence conflicts with evaluation. |
| `bioeth_prs.tex:1246` | “All relevant code and results can be found on GitHub…” | “Code and result records are available at [repository URL], release/tag [identifier], commit [hash].” | Pin the reviewed artifact version. |

Edit: Use “variant” for general biological discussion and “SNP” only where the implementation’s biallelic-SNP restriction or table labels require it.

Edit: Use “requester” for the transaction actor, “sample” for the registered genotype record, and “individual” only for evaluated persons.

Edit: Add a compact symbol table for $g_i$, $\beta_i$, $q_i$, $s$, $z_w$, $z_s$, $e$, $B$, $\tau_L$, $\tau_H$, $R$, and $W$.

## 2. Claim–code suggestions

### Coverage table

| Claim | Verbatim paper text and location | Type | Implementation / producer | Config / result | Status |
|---|---|---|---|---|---|
| C01 | “uses four smart contracts” (`bioeth_prs.tex:320`) | feature | `contracts/GenomicRegistry.sol`; `ModelMarketplace.sol`; `PRSComputeEngine.sol`; `ResultOracle.sol` | `scripts/deploy.ts` | mapped |
| C02 | “without relying on a designated evaluator” (`82–84`) | security/design | Contract orchestration across C01 | Architecture and trust tables | partially mapped |
| C03 | “checked for valid genotype values and aligned” (`103–104`) | dataset/accuracy | `validation/independent_prs_reference.py` | preprocessing examples and tests | partially mapped |
| C04 | “missingness, genome build, variant identity and order, allele orientation” (`240–241`) | dataset/accuracy | `validation/independent_prs_reference.py` | metadata examples/tests | partially mapped |
| C05 | “converts signed weights to nonnegative integers without overflow” (`104–105`) | accuracy/security | `PRSComputeEngine._encodeFinalScore`; model validation | quantization tests | mapped |
| C06 | “exact half ties are rounded away from zero” (`438`) | accuracy | Python reference implements rule; TypeScript advisor uses `Math.round` | no negative-half-tie fixture found | partially mapped |
| C07 | “$z_w=\max(0,-\min_iq_i)$” (`445`) | algorithm | advisor/model publication and score correction | quantization tests | mapped |
| C08 | “$4sMN\le 2^{64}-1$” (`575`) | scale/security | quantization safety calculation | advisor output | mapped |
| C09 | candidate scale set (`585–588`) | parameter | `scripts/quantization_advisor.ts:117–129` | `DEFAULT_SCALES` | no mapping found |
| C10 | “1–15% MAE” (`594`) | accuracy | `scripts/quantization_advisor.ts` | advisor JSON reports absolute MAE 0.012–0.150 | no mapping found |
| C11 | “approximately 200 ms” (`602`) | performance | expected advisor script | no per-run timing artifact found | no mapping found |
| C12 | “scale does not change gas use” (`603`) | performance | contracts use fixed `euint64`; advisor estimates width-sensitive costs | gas evidence | partially mapped |
| C13 | Classic stores encrypted SNP references (`625–627`) | feature | `PRSComputeEngine` stored-input path | lifecycle/chunk tests | mapped |
| C14 | Streaming discards each input group (`635–637`) | feature | `PRSComputeEngine.appendAndComputeChunk` | chunk tests | mapped |
| C15 | “35.4–37.2% less gas” (`618–619`) | performance | gas profile scripts | `evidence/phase8/heprs_profile.json`; table inputs | mapped |
| C16 | “largest successful … 21 SNPs” (`309–311`, `829–831`) | scale | HCU probe | `evidence/phase7/hcu_public.json`; `hcu_private.json` | mapped |
| C17 | private-weight requester authorization (`657–660`, `1099–1102`) | security/feature | `PRSComputeEngine.createPRSJob`; `ModelMarketplace.getEncryptedWeightChunk` | private-weight tests | mapped |
| C18 | thresholds and oracle fixed before requests (`735–737`) | security | `ModelMarketplace.setReleasePolicy` | policy tests | mapped |
| C19 | model settings “cannot be changed” (`347`) | feature | weights/release policy immutable; `setRateLimit` mutable | lifecycle tests | partially mapped |
| C20 | uniform $\nu\in\{0,\ldots,B-1\}$ (`727–733`) | security/algorithm | `ResultOracle._classifyScore`; `FHE.randEuint64` | `noiseUpperBound` constructor | mapped |
| C21 | requester cannot know random value before mining (`358–360`) | security | call to fhEVM random primitive | no independent service proof in repository | partially mapped |
| C22 | threshold gap at least $B$ (`748–749`) | security | `ModelMarketplace.setReleasePolicy`; `ResultOracle._classifyScore` | policy tests | mapped |
| C23 | “does not provide … differential privacy” (`752–755`) | security | no privacy accountant or DP mechanism; explicit contract comments | repository-wide search | mapped |
| C24 | exact mean 63.5 and integer correction 64 at $B=128$ (`757–760`) | accuracy | `ResultOracle.expectedNoiseBias` returns `B/2` | category evidence | mapped |
| C25 | per-wallet/per-sample query limits (`805–807`) | security | `PRSComputeEngine` rate-limit windows | `evidence/phase6/anti_probing_results.json` | mapped |
| C26 | “one result per calculation” (`720`) | security | finalization flag limits final result; `readPartial` is a separate output path | lifecycle tests | partially mapped |
| C27 | fixed-threshold attack: 0/20 within $B$, $r=0.9388$, 70% sign (`800–803`) | security/performance | anti-probing script | `evidence/phase6/anti_probing_results.json` | mapped |
| C28 | correlated-block $r=0.0223$ (`807–810`) | security/performance | anti-probing script | phase 6 JSON | mapped |
| C29 | 260 queries imply 288.9 h / 48.1 h (`810–813`) | performance | derived from $260/3\times1000$ blocks | phase 6 JSON/README | mapped |
| C30 | $B=128$ is 1.34% of largest integer weight (`813–814`) | parameter | anti-probing fixtures | phase 6 JSON | mapped |
| C31 | Sepolia public 100-SNP, 25 tx, 20.710271 M gas (`833–836`) | performance/scale | live validation scripts | `evidence/phase7/live_2026-07-31/public_success.json` | mapped |
| C32 | 269,320 ms result and 8,081 ms decrypt (`833–836`) | performance | live validation records | phase 7 public success JSON | mapped |
| C33 | encoded score 758,685 matched independent calculation (`835–836`) | accuracy | independent reference comparison | phase 7 README/JSON | mapped |
| C34 | private 100-SNP only local (`837`) | scale | local validation only | phase 8/README and Sepolia notes | mapped |
| C35 | 200/200 exact local matches (`859–863`) | accuracy | `scripts/individual_level_validation.ts`; Python reference | `evidence/phase5/individual_level_comparison.csv` | mapped |
| C36 | 6,604 values, at most six decimals (`865–868`) | dataset | HEPRS fixture loader/profile | fixture files and phase 8 profile | mapped |
| C37 | category agreement 48 stable, 2 uncertain, 1 changed (`888–890`) | accuracy | category comparison | `evidence/phase5/category_agreement_100snp.json` | mapped |
| C38 | local transaction counts 15/47/88/413 (`894–915`) | scale | evidence synthesis | `evidence/phase8/scale_evidence.json` | mapped |
| C39 | gas totals and reductions (`946–949`) | performance | gas profile | `evidence/phase8/heprs_profile.json` | mapped |
| C40 | gas grows approximately linearly (`920–924`) | performance | four measured points | phase 8 profile | mapped |
| C41 | per-SNP components about 50k/27k/27k (`956–979`) | performance | expected gas-decomposition measurement | no direct current component output found | mapping unclear |
| C42 | local times 157/780/1,672/8,819 ms (`986–991`) | performance | fixture profiling | phase 8 profile | mapped |
| C43 | 1.554–1.763 ms/position and about 13% increase (`988–990`) | performance | derived from C42 and position counts | recomputed from phase 8 values | mapped |
| C44 | deployment/calc gas and test-ETH expenditure (`997–1004`) | performance | live receipts/evidence synthesis | phase 7/8 JSON | mapped |
| C45 | private/public local gas ratio 2.01× (`1001–1004`) | performance | measured transaction use | phase 8 JSON | mapped |
| C46 | fingerprint adds 40,568 gas (`1029–1031`) | performance | provenance gas tests | phase 8 measurement files | mapped |
| C47 | policy 77,314; raw 169,898; category 432,230 gas (`1032–1035`) | performance | release-policy gas script | phase 8 measured transaction JSON | mapped |
| C48 | ETH examples at 1 and 30 gwei (`1037–1042`) | performance | arithmetic from three gas totals | `evidence/phase8/fee_sensitivity.json` | mapped |
| C49 | contracts do not establish biological source/clinical validity (`1070–1075`) | security/limit | no binding between ciphertext and sample; provenance is commitment only | provenance tests/comments | mapped |
| C50 | raw score requester-only; category public (`1087–1089`) | security/feature | `FHE.allow(...requester)`; `FHE.makePubliclyDecryptable` | result tests | mapped |
| C51 | private access checked for every group (`1099–1102`) | security | weight-chunk authorization in marketplace/engine | private-weight tests | mapped |
| C52 | HEPRS 110,000-SNP performance/correlation (`166–174`, `281–283`) | baseline | no baseline implementation/submodule | cited HEPRS paper only | partially mapped |
| C53 | “first complete FHE calculation of PRS” (`1190`) | literature claim | expected literature review | cited HEPRS paper | mapping unclear |
| C54 | “builds directly on HEPRS computational framework” (`1193`) | feature/baseline | fixture reuse; no imported HEPRS code | fixture provenance | no mapping found |
| C55 | no new datasets analyzed (`1242`) | dataset | four HEPRS-derived fixture datasets are analyzed | `test/fixtures`; `evidence/phase5–8` | no mapping found |
| C56 | all relevant code/results at unpinned GitHub URL (`1246`) | environment | repository exists locally | no release/tag pinned in paper | partially mapped |
| C57 | Node/library environment supports reproduction | environment | `package.json`, lockfile, Hardhat config | archived Node 22.23.1; current Node 25.5.0 | partially mapped |
| C58 | deployed randomized-release scale corresponds to $B=128$ examples | parameter | `scripts/deploy.ts:109` deploys $B=2^{20}$; phase 6 local analysis uses $B=128$ | deployment/evidence configs | mapping unclear |

### Suggestions for non-clean mappings

| Claim | Paper says | Code shows | Suggested edit |
|---|---|---|---|
| C02 | No designated evaluator. | Contracts coordinate jobs, but fhEVM coprocessor/decryption services remain trusted dependencies. | Keep “no designated evaluator” and immediately retain the current dependency qualification. |
| C03–C04 | bioETH-PRS performs QC and allele alignment. | These checks are in the independent preprocessing/reference workflow, not Solidity. | Replace “bioETH-PRS checks” with “the pre-encryption workflow checks,” and cite its path. |
| C06 | Half ties round away from zero in the implementation. | Python does; JavaScript `Math.round` does not for negative half ties. | Implement an explicit half-away helper in TypeScript and add negative-half-tie tests, or narrow the manuscript to evaluated non-tie inputs. |
| C09 | Five candidate scales through $10^{10}$. | Advisor defaults to eleven scales through $10^7$. | Replace the manuscript set with `DEFAULT_SCALES`, or change code and regenerate all advisor evidence. |
| C10 | Low scale has “1–15% MAE.” | Result files hold absolute MAE values 0.012–0.150 without a percentage denominator. | Report PRS units, or define and regenerate a normalized percentage metric. |
| C11 | Advisor takes about 200 ms. | No advisor wall-time record was found; a separate cross-language run contains a 200 ms value. | Remove the number until an advisor-specific timed run with hardware metadata is saved. |
| C12 | Scale never changes gas. | Fixed `euint64` on-chain operations are unchanged, but the advisor models bit-width-dependent costs. | Qualify the claim to the present fixed-width contract implementation. |
| C19 | Models cannot change after publication. | Weights and release policy are immutable; the owner can loosen, tighten, or disable rate limits. | State exactly which fields remain mutable. |
| C21 | Random value is unknowable before mining. | Solidity calls the fhEVM random primitive; unpredictability depends on fhEVM service behavior. | Describe it as an explicit service assumption and cite versioned fhEVM documentation. |
| C26 | One result is released per calculation. | One finalization is enforced, but `readPartial` grants the requester an intermediate accumulator when oracle release is optional. | Remove/restrict `readPartial` in the evaluated deployment, or document and include it in the probing analysis. |
| C41 | Per-SNP operation gas is 50k/27k/27k. | Current total-gas evidence exists, but no direct current decomposition record was found. | Add a measurement script/output for each component or label the rows as heuristic estimates. |
| C50 | Results are requester-only in several earlier passages. | Raw score is requester-authorized; randomized category is public. | Apply the same two-path wording at lines 82–87, 303–306, 329–333, 703, 1063, and 1217. |
| C52 | HEPRS baseline numbers are compared. | No pinned baseline implementation or invocation exists in this repository. | Pin the HEPRS paper/version, fixture provenance, and exact source table; do not imply a rerun. |
| C53 | HEPRS is the first complete FHE PRS calculation. | Repository evidence cannot establish literature priority. | Attribute the wording to the cited work or qualify it after a documented literature check. |
| C54 | bioETH-PRS builds directly on HEPRS code/framework. | The repository reuses study fixtures and Equation 1, not an HEPRS code dependency. | Use “uses the HEPRS study fixtures and additive PRS definition.” |
| C55 | No datasets were analyzed. | The evaluation analyzes HEPRS-derived fixtures. | Say no new datasets were generated and name the analyzed fixtures. |
| C56–C57 | The GitHub repository is sufficient for reproduction. | The URL is unpinned; tests pass under an unsupported current Node; `tsc --noEmit` fails. | Pin a release/commit, specify Node 22, and resolve or disclose static type-check failures. |
| C58 | $B=128$ is discussed as the studied noise bound. | Local anti-probing uses 128; deployment script uses 1,048,576. | State the scope of each bound and identify the bound of the reported Sepolia oracle deployment. |

Edit: Add one artifact-appendix sentence mapping the preprocessing workflow, quantization advisor, independent scorer, anti-probing script, gas profiler, and live Sepolia record to their exact paths.

Edit: Add one sentence noting that provenance hashes bind result records to files and configuration but do not prove that ciphertexts originated from a stated person.

Edit: Add one sentence documenting `readPartial` as a debug/legacy interface, or remove it from the release artifact if it is outside the protocol.

## 3. Revision confirmations

### Churn summary

| File / section | Prior | Current | Change / touched area | Confirmation check |
|---|---:|---:|---|---|
| `bioeth_prs.tex` | 1,156 lines | 1,252 lines | +784/−689; 61.2% normalized churn | Confirm all claim changes below were intended. |
| `bioeth_prs.bib` | 215 lines | 195 lines | +136/−157; 71.5% normalized churn | Confirm changed works, not only formatting. |
| Abstract | ~173 words | ~241 words | +39.3% | Confirm all added numerical details match evaluation. |
| Key Points | ~75 | ~99 | +32.0% | Confirm only final supported highlights remain. |
| Introduction | ~628 | ~611 | −2.7% | Confirm removed broad trust/clinical claims were intentional. |
| Background | ~529 | ~815 | +54.1% | Confirm new preprocessing rules reflect artifact scope. |
| System design | ~588 | ~637 | +8.3% | Confirm result-recipient wording distinguishes raw/category. |
| Quantization | ~994 | ~1,149 | +15.6% | Confirm candidate scales and rounding match code. |
| Calculation methods | ~545 | ~286 | −47.5% | Confirm removed pseudocode is fully replaced by exact prose. |
| Security | ~758 | ~1,219 | +60.8% | Confirm threat-model expansion and `readPartial` treatment. |
| Evaluation | ~886 | ~1,588 | +79.2% | Confirm each added number cites its evidence record. |
| Access/control | ~402 | ~197 | −51.0% | Confirm no remaining guarantee depended on deleted detail. |
| Discussion | ~509 | ~517 | +1.6% | Confirm Sepolia/local scopes stay distinct. |
| Related Work | ~234 | ~242 | +3.4% | Confirm bibliography entries support unchanged claims. |
| Conclusion | ~242 | ~213 | −12.0% | Confirm final limitations mirror abstract/evaluation. |
| Figures | 6 PNGs | 6 PNGs | 4 changed; 2 byte-identical | Confirm only text corrections were intended. |
| Package files | source + stale build files | source, manifest, README, BBL, two PDFs | packaging restructured | Confirm upload excludes stale prior auxiliaries. |

Check: `fig_quantization.png` and `fig_gas_scaling.png` are byte-identical across versions.

Check: `fig_architecture.png`, `fig_protocol.png`, `fig_security.png`, and `graphical_abstract.png` changed; confirm their source text matches the current manuscript and does not add unsupported guarantees.

Check: No figure filename was added or removed; confirm this matches the decision to omit the individual-agreement and workflow figures.

### Confirmation list, sorted by load-bearing impact

| What changed | Old | New | Why to confirm | Suggested action |
|---|---|---|---|---|
| Trust and correctness | “computation verified by blockchain consensus” | Blockchain records/finalizes calls but does not independently verify fhEVM arithmetic | Changes the core guarantee | Keep the narrower wording consistently in text and figures. |
| Evaluator claim | “evaluator-free architecture” | No designated evaluator, but blockchain/fhEVM dependencies remain | Avoids replacing one trust assumption with an absolute claim | Use “reduces reliance on a designated evaluator.” |
| Privacy mechanism | “noisy output oracle” and DP-adjacent language | “randomized category,” explicitly not differential privacy | Changes the privacy claim | Keep non-DP language and remove any residual “DP noise.” |
| Result visibility | Raw/noisy release language | Raw score ACL-gated; category publicly decryptable | Several current passages still say requester-only | Apply C50 wording globally. |
| Threat model | Short defense-layer description | Attacker, source authenticity, trust boundary, repeated-query limits | Security section grew 60.8% | Add `readPartial` and mutable rate limits to the analysis. |
| Source authenticity | Inputs treated as registered sample | Contracts do not prove encrypted values came from that sample | Narrows what registry/provenance proves | Keep the explicit biological-preparation boundary. |
| Quantization clamp | Earlier figure/example lacked full unsigned treatment | Text adds $z_w=\max(0,-\min q_i)$ and intermediate bound | Algorithm is load-bearing | Reconcile the TypeScript tie rule and scale candidates. |
| Protocol algorithm | Pseudocode passed oracle and thresholds per request and mentioned TSTORE | Prose uses fixed model policy and persistent-state-free streaming | Corrects algorithm logic | Confirm all scripts/tests use the new one-argument finalization API. |
| Partial outputs | Older text focused on final output | Current text says one result per calculation | Code still exposes `readPartial` | Decide whether this interface belongs in the evaluated protocol. |
| Repeated-query analysis | Analytical ~2,800-hour estimate | Measured attack cases plus 288.9/48.1-hour calculated examples | Replaces security evidence | Cite phase 6 and retain “calculated, not measured network time.” |
| Sepolia scope | Expected HCU/cost and broad feasibility language | One public 100-SNP result; private and scale sweep are local | Changes deployment evidence | Keep every table/caption labeled Sepolia or local. |
| Gas values | Original figure/table values | New table values from post-review evidence | Figure remains numerically old | Regenerate the old-style chart from final table data or remove plotted numbers. |
| Cost claims | USD/L2 projections and affordability statements | Observed test ETH plus illustrative ETH arithmetic, no affordability claim | Removes speculative economic conclusions | Keep the current scoped cost wording. |
| Agreement evidence | Earlier correctness summary | 200 individual comparisons and 4-row error table | Adds accuracy evidence | Cite phase 5 and retain the “studied inputs” limitation. |
| Preprocessing | Little QC detail | Build/order/missingness/allele rules added | Could be read as on-chain functionality | Identify it explicitly as pre-encryption workflow. |
| HEPRS relationship | Broad computational-framework inheritance | Still says “builds directly” | No code dependency was found | Replace with fixture/equation reuse. |
| PGS Catalog citation | PGS Catalog article | Key now points to “Towards Clinical Utility…” | The sentence still specifically invokes PGS Catalog | Restore DOI `10.1038/s41588-021-00783-5` for that sentence. |
| Kim citation | BMC article `10.1186/1472-6947-15-S5-S3` | FC chapter `10.1007/978-3-662-48185-7_14` | Current claim is the 5,000-sequence study | Confirm which version contains the reported experiment and cite it exactly. |
| Blatt citation | BMC “Optimized…” | PNAS “Secure Large-Scale…” | The selected PNAS paper reports a PRS analysis derived from its HE tests | Recheck “PRS … was future work” and describe the selected paper’s actual PRS scope. |
| McLaren citation | Genetics in Medicine HIV clinical study | Workshop paper with a different title | Current prose describes the clinical study | Restore DOI `10.1038/gim.2015.167` unless prose is changed. |
| Raisaro citation | MedCo paper `10.1109/TCBB.2018.2854776` | Different i2b2/DP paper `10.1109/TCBB.2018.2854782` | Current prose explicitly says MedCo | Restore the MedCo entry. |
| Lattigo citation | Pinned v4.1.0 | Generic v5 repository | HEPRS parameter/version reproducibility may differ | Pin the version actually used by HEPRS or remove the version claim. |
| Data availability | No datasets generated/analyzed | Unchanged despite new fixture evidence | Conflicts with evaluation | Use the C55 replacement. |
| Artifact URL | Unpinned repository URL | Unchanged | Current tree may move after submission | Pin a release/tag and commit. |
| Figures | Old images preferred | Four text-corrected images retained | Image edits could silently change claims | Keep image source/script and hash list in manifest. |

Check: Confirm the new citation entries against publisher records: the [PGS Catalog sentence](https://www.nature.com/articles/s41588-021-00783-5) corresponds to DOI `10.1038/s41588-021-00783-5`; the [HIV clinical-care sentence](https://www.nature.com/articles/gim2015167) corresponds to DOI `10.1038/gim.2015.167`; and the [MedCo sentence](https://pubmed.ncbi.nlm.nih.gov/30010584/) corresponds to DOI `10.1109/TCBB.2018.2854776`.

Check: Recheck the Blatt sentence against the selected [PNAS paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC7261120/), which includes a PRS analysis derived from HE test results; do not retain “PRS … was future work” unless the cited passage supports that narrower statement.

Check: Confirm metadata, author list, affiliations, acknowledgments, funding, and code URL against the submission form; the source diff did not indicate an author-list change, but the package now includes rendered response and manuscript PDFs.

## 4. Checks to run

Check: Reproduce the passing contract suite under a supported runtime with `nvm use 22 && npm ci && npm run build && npm test`; the current run produced 188 passing tests under unsupported Node 25.5.0.

Check: Run `npx tsc --noEmit` after replacing stale `setOracleRequired`/`setApprovedOracle` calls with `setReleasePolicy`, updating the obsolete four-argument `finalizeAndClassify` signature, and fixing `ProbeResult.provenance` typing.

Check: Run `npm run validate:cross-language`; the present run passed the independent Python self-tests and all three contract/reference cases.

Check: Add regression cases for `-0.5`, `-1.5`, and `-2.5` at a unit scale to both the TypeScript advisor and Python reference, then require identical half-away results.

Check: Run and save an advisor-specific timing command on the stated hardware before retaining the “approximately 200 ms” sentence.

Check: Add a script or trace that independently produces each per-SNP gas component in Table 7, then save the output under `evidence/`.

Check: Decide whether `PRSComputeEngine.readPartial` is part of the protocol; if yes, include it in the release and probing analysis, and if no, remove or gate it before building the artifact.

Check: Record the deployed Sepolia `ResultOracle.noiseUpperBound()` and distinguish it from the local $B=128$ anti-probing setting.

Check: The clean Tectonic rebuild completed as a 14-page PDF with no undefined citations, references, or overfull boxes; extracted text matched `bioeth_prs_final_arxiv.pdf`, and only engine/caption/font-substitution warnings remained.

Check: Compare the final gas figure’s plotted numbers with Table 7; retain the old visual style only after substituting the final table values.

Check: Pin HEPRS, Lattigo, fhEVM, Solidity, Hardhat, Node, and the artifact commit/tag in a reproducibility paragraph or manifest.

Check: Verify every figure caption after final image replacement and ensure the rendered response letter and manuscript quote identical raw-score/category, DP, Sepolia/local, gas, and correctness boundaries.

## 5. Response-letter starter

- Edit: “We revised the trust description to state that smart contracts coordinate and record the workflow, while fhEVM services perform the encrypted arithmetic and blockchain consensus does not independently verify that arithmetic.”
- Edit: “We replaced differential-privacy terminology with ‘randomized categorical release’ and now state why the mechanism is not an $(\varepsilon,\delta)$-DP guarantee.”
- Edit: “We clarified that raw scores are ACL-granted to the requester, whereas randomized categories are publicly decryptable.”
- Edit: “We added a plain-language preprocessing boundary covering dosage validity, genome build, variant order, missingness, and effect-allele alignment before encryption.”
- Edit: “We now state that provenance commitments document preparation inputs but do not prove that submitted ciphertexts originated from the registered biological sample.”
- Edit: “We replaced the TSTORE-based Streaming description with the implemented same-transaction upload-and-accumulate path, which does not persist SNP handles.”
- Edit: “We replaced the prior pseudocode with prose that reflects the immutable model-level release policy and the current one-argument `finalizeAndClassify(jobId)` interface.”
- Edit: “We added an independent comparison for 200 public-weight calculations; all 200 matched Equation 1 exactly for the evaluated fixtures, whose weights were represented without rounding.”
- Edit: “We separated the one observed public-weight Sepolia result from local-simulation evidence and no longer infer Sepolia HCU capacity from the local environment.”
- Edit: “We replaced projected USD affordability statements with observed Sepolia test-ETH use and clearly labeled ETH fee calculations that use hypothetical gas prices.”
- Edit: “We expanded the repeated-query analysis to report raw-score, adaptive-threshold, fixed-threshold, correlated-input, multi-wallet, and multi-sample cases, while stating that the controls do not completely hide private weights.”
- Edit: “We retained the original quantization visual style and added the unsigned clamp and intermediate-value safety condition in the manuscript; we will align the TypeScript tie-breaking rule and candidate-scale list with that description.”
- Edit: “We limited scale claims to the evaluated 100–5,000-variant range and explicitly state that the study does not establish genome-wide or clinical use.”
- Edit: “We revised the architecture and security figures only where required to remove unsupported trust, privacy, or protocol claims.”
- Edit: “We will restore or verify the bibliography records for the PGS Catalog, HIV clinical study, MedCo, Kim–Lauter, Blatt, and the Lattigo version so that each citation supports its attached sentence.”
- Edit: “We will pin the repository release and supported Node/toolchain versions, and will resolve the remaining static TypeScript errors before archiving the final artifact.”
