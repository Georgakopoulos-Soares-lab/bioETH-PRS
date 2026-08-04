# Manuscript excerpts to add to the RTR

Per-comment, verbatim text from the current manuscript to paste into the response to
reviewers so that reviewers can read the exact revised wording.

- Source: `RTR_and_paper/final_arxiv_upload/bioeth_prs.tex`
- Section, table, figure, and equation numbers are from the current 16-page
  `bioeth_prs_final_arxiv.pdf`.
- Section names below already incorporate the heading corrections recorded in
  `../plans/final_arxiv_parity_audit.md`, so adding these blocks also resolves the
  stale section pointers in the RTR.
- LaTeX markup is rendered to plain reading text; wording is verbatim.

## Section map for the current manuscript

| # | Section |
|---|---|
| 1 | Introduction |
| 2 | Background — 2.1 Polygenic Risk Scores; 2.2 Genotype Preprocessing, QC, and Model Alignment; 2.3 Fully Homomorphic Encryption; 2.4 Programmable Blockchain and fhEVM |
| 3 | System Design — 3.1 Architecture Overview; 3.2 Comparison with HEPRS |
| 4 | Representing Decimal Weights as Integers — 4.1 The Representation Problem; 4.2 Three-Step Unsigned Encoding; 4.3 Worked Example; 4.4 Overflow Safety; 4.5 Quantization Advisor |
| 5 | Execution Protocols — 5.1 Classic Method (Stored Inputs); 5.2 Streaming Method |
| 6 | Security Assumptions and Limits — 6.1 Threat Model; 6.2 Source of the Encrypted SNPs; 6.3 Core Privacy Invariants; 6.4 Randomized Risk Category; 6.5 Analysis of Repeated Queries |
| 7 | Empirical Evaluation — 7.1 Where Calculations Were Evaluated; 7.2 Agreement with an Independent Calculation; 7.3 Variant Scale; 7.4 Gas Consumption and Scaling; 7.5 Per-SNP Cost Decomposition; 7.6 Latency; 7.7 Transactions, Gas, and Fee Examples; 7.8 Calculation Checks and Responsibilities |
| 8 | Access Control and Compute Flows — 8.1 Encrypted Handle Lifecycle; 8.2 State Machine and Mutual Exclusion; 8.3 Private Model Access Control |
| 9 | Discussion — 9.1 HEPRS and bioETH-PRS: Complementary Systems; 9.2 Limitations and Open Problems; 9.3 Future Directions |
| 10 | Related Work |
| 11 | Conclusion |

Tables: 1 HEPRS comparison (3.2) · 2 trust boundary (6.2) · 3 repeated queries (6.5) ·
4 Sepolia vs local (7.1) · 5 independent agreement (7.2) · 6 transactions by scale (7.3) ·
7 gas by method (7.4) · 8 per-SNP gas (7.5) · 9 measured transaction use (7.7) ·
10 responsibilities (7.8).

Figures: 1 graphical abstract · 2 architecture · 3 quantization · 4 protocol ·
5 security · 6 gas scaling.

---

# Reviewer 1

## General assessment

**Abstract**
```
We present bioETH-PRS, which uses publicly auditable smart contracts to coordinate
the calculation on a blockchain that supports Fully Homomorphic Encryption (fhEVM).
This reduces reliance on a single evaluator, but the system still depends on the
smart contracts, blockchain, and fhEVM computation and decryption services.
```

**Key Points, first bullet**
```
Smart contracts reduce reliance on a single designated evaluator, but the system
still depends on the blockchain and fhEVM services.
```

**Section 1, Introduction ("Our contribution.")**
```
We propose bioETH-PRS, in which publicly auditable smart contracts coordinate the
encrypted calculation and control how results are released. A designated evaluator
is no longer required. However, the system still relies on the contracts, blockchain
consensus, and the fhEVM computation and decryption services (Figure 1). The
blockchain records the contract steps, but it does not by itself prove that the
encrypted arithmetic was correct.
```

**Section 9, Discussion (opening paragraph)**
```
We evaluated bioETH-PRS with additive PRS models containing up to 5,000 variants.
Publicly auditable smart contracts reduce reliance on a single designated evaluator,
but the system still depends on the blockchain and on fhEVM services that perform
encrypted calculations, submit transactions, and apply the configured release
permissions. A public-weight 100-SNP calculation completed on Sepolia. Public-weight
calculations with 100-5,000 variants and one private-weight 100-SNP calculation were
evaluated in the local simulation. These results do not establish genome-wide or
clinical use.
```

## Comment 1 — Sepolia and local evaluation

**Section 7.1, Where Calculations Were Evaluated (first paragraph)**
```
We report results from Sepolia and from a local contract simulation. Sepolia provides
observed fhEVM transaction results. The local simulation evaluates contract behavior,
transaction counts, and gas used in a local contract environment; it does not measure
real encrypted-computation time, Sepolia capacity, or production fees.
```

**Section 7.1, Where Calculations Were Evaluated (Sepolia result)**
```
On Sepolia (chain ID 11155111), a public-weight 100-SNP calculation completed in 25
transactions after four contract deployments. It used 20.710271 million gas, took
269,320 ms from submission to result and 8,081 ms to decrypt, and returned an encoded
score of 758,685. This score exactly matched the independent calculation. The
private-weight 100-SNP calculation was evaluated locally but was not run on Sepolia.
```

**Table 4 caption**
```
Sepolia and local results for the same public-weight 100-SNP calculation using the
Classic method (stored inputs), upload groups of 32, calculation groups of 10, and 25
transactions. Sepolia used 10.42% more gas than this one local simulation; this
percentage is not a general conversion between local and network results.
```

**Section 2.4, Programmable Blockchain and fhEVM (HCU)**
```
A per-transaction Homomorphic Computation Unit (HCU) budget limits FHE operations.
In the local simulation, the largest successful calculation chunk contained 21 SNPs
for both model types (Section 7); the Sepolia limit remains unmeasured and is not
inferred from that result. The HCU constraint necessitates chunked computation
strategies for large input vectors.
```

**Section 7.6, Latency**
```
These times combine the local arithmetic and transaction overhead; they measure
neither real TFHE evaluation nor network latency. ... The separate Sepolia 100-SNP
times appear in Table 4 and are not compared as a speed ratio.
```

## Comment 2 — Trust language

**Title**
```
bioETH-PRS: Confidential Polygenic Risk Scoring with Smart Contracts on an
FHE-Enabled Blockchain
```

**Figure 1 caption (Graphical Abstract)**
```
bioETH-PRS uses smart contracts to coordinate an encrypted PRS calculation instead of
relying on a designated evaluator. The system still depends on the blockchain and on
fhEVM services that perform encrypted calculations and apply the configured release
permissions. Raw scores are authorized only for the requester, whereas randomized
categories are publicly decryptable.
```

**Section 2.4, Programmable Blockchain and fhEVM**
```
An on-chain contract records the release permission for each result. If the fhEVM
services work as specified, only the requester can decrypt a raw score authorized by
the contract, whereas a randomized category is publicly decryptable. The blockchain
records these decisions and calls, but it does not independently verify the encrypted
calculation or prevent a failure of the fhEVM calculation and decryption services.
```

**Table 2 caption (Section 6.2)**
```
Parts of the system on which privacy, correctness, availability, and the sample or
model record depend. A mark shows what could be affected if that part fails.
```

**Section 11, Conclusion (first paragraph)**
```
Publicly auditable smart contracts coordinate the calculation without a designated
evaluator. This reduces reliance on one evaluator but does not remove trust: the
result still depends on genotype preparation, model validity, the contracts,
blockchain, and fhEVM services that perform encrypted calculations and apply the
configured release permissions. Raw scores are authorized only for the requester,
whereas randomized categories are publicly decryptable.
```

## Comment 3 — Differential-privacy framing

**Section 6.4, Randomized Risk Category (Equation 8)**
```
Before assigning Low, Medium, or High risk, the Result contract adds a random
nonnegative integer smaller than B to the encoded score:

    e_randomized = e + v,    v ~ DiscreteUniform{0, 1, ..., B-1}.

The fhEVM supplies v; the requester does not choose it. The oracle deployer fixes B,
a power-of-two immutable constant, in the oracle constructor.
```

**Section 6.4, "Interpretation and limits."**
```
This method does not provide an (epsilon, delta)-differential privacy guarantee. It
uses one-sided noise, does not relate B to a formal measure of how much one input can
change the score, and does not account for information from repeated queries. A formal
privacy method would need to address each of these points.
```

**Section 6.4, "Bias correction."**
```
Because the random value is always nonnegative, its exact mean is (B-1)/2. The
contract provides the integer threshold correction B/2; for B = 128, this is 64, while
the exact mean is 63.5. Scores close to a threshold remain uncertain. In the 100-SNP
study, 48 individuals outside this uncertainty range kept the same category. The other
two were each 64 units below a threshold, so their category could change. The B = 128
category-agreement and repeated-query results were obtained only in the local
simulation. The deployment script uses B = 2^20 for its general oracle deployment, and
we did not evaluate a randomized category release on Sepolia.
```

**Section 9.2, Limitations and Open Problems ("One-sided randomization and bias.")**
```
Adding an integer chosen uniformly from 0 through B-1 increases the score by (B-1)/2
on average and creates an uncertainty range near each threshold. This randomized
category result is not differential privacy because the random value is one-sided, is
not formally calibrated to score sensitivity, and has no formal composition accounting
across repeated queries.
```

**Key Points, fifth bullet**
```
Randomized risk categories and query limits make exact recovery of private weights
harder, but they do not provide differential privacy or completely hide the weights.
```

## Comment 4 — Repeated-query analysis

**Section 6.5, Analysis of Repeated Queries (rate-limit mechanism)**
```
Without query limits, an adversary could attempt a model-extraction attack by
submitting many classification queries with crafted SNP inputs and observing the
resulting categories. The compute engine therefore enforces per-model, per-wallet, and
per-sample job quotas over a window of W blocks, admitting at most R queries per
window. Block-based windows, rather than timestamps, prevent miner manipulation of
window boundaries.
```

**Section 6.5, Analysis of Repeated Queries (design and definitions)**
```
We examined whether a requester allowed to use a model with 20 private weights could
infer the weights by submitting chosen encrypted SNP values and observing the released
results. The analysis included thresholds chosen by the requester, with each query
chosen after seeing earlier results or all queries chosen in advance; thresholds fixed
by the model provider; several wallets and samples; and correlated SNP patterns. These
calculations were performed in the local simulation. To make the analysis repeatable,
we used a fixed sequence of random integers from 0 through 127. A different random
sequence may give different exact recovery counts. "Within B" means that an estimated
integer weight differs from the true integer weight by less than 128 units; it does not
mean exact recovery. Pearson r measures whether the estimated weights preserve the
true relative pattern, and sign accuracy is the fraction whose positive or negative
direction is correct. The 320-query rows use a common comparison budget rather than a
protocol security threshold.
```

**Table 3 (Section 6.5)**
```
Results of the repeated-query analysis in the local simulation. "Within B" is the
number of weights estimated to within the randomization range.

Information released and query choice                        Queries   Pearson r  Sign acc.  Within B
Raw score available                                              20      1.0000       100%     20/20
Requester changes threshold after each result                    200      0.9999       100%     19/20
Requester changes threshold after each result, first 20/20       260      1.0000       100%     20/20
Requester-selected thresholds, queries chosen in advance         320      0.6689        65%      0/20
Thresholds fixed by model provider                               320      0.9388        70%      0/20
Fixed thresholds with correlated SNP blocks                      320      0.0223        65%      0/20
```

**Section 6.5, Analysis of Repeated Queries (results)**
```
In this analysis, changing the threshold after each result recovered 19 of 20 weights
within B after 200 queries and first recovered all 20 after 260 queries. When all
queries were chosen in advance, none was recovered within B after 320 queries
(r = 0.6689; 65% of signs correct). With thresholds fixed by the model provider, none
of the 20 estimates was within B after 320 queries. However, Pearson r = 0.9388 and
70% sign accuracy show that the results still revealed some information about the
relative weights. The fixed thresholds therefore made precise recovery harder but did
not completely hide the private weights.
```

**Section 6.5, Analysis of Repeated Queries (wallets, samples, correlation, timing)**
```
Using several wallets did not increase the number of queries allowed for the same
sample, although different registered samples had separate limits. For private weights,
the model provider decides who may use them. When inputs were restricted to correlated
SNP blocks, the correlation between estimated and true weights fell to 0.0223. This is
not a reliable safeguard because requesters can still submit other encrypted SNP
values. Applying the studied limit of three calculations per 1,000 blocks to 260 total
queries gives calculated times of 288.9 hours with 12-second blocks or 48.1 hours with
2-second blocks for one registered sample. These are calculated examples, not measured
network times. The chosen B = 128 was 1.34% of the largest integer weight; other models
may require a different value. The model owner can update or disable the rate limits
after publication, so their protection depends on the maintained configuration.
```

## Comment 5 — SNP authenticity

**Section 6.1, Threat Model**
```
A requester who is allowed to use private weights may submit values that do not come
from the registered sample. The adversary may not break the TFHE hardness assumption
or bypass the contract rules about who may use data and receive results.
```

**Section 6.2, Source of the Encrypted SNPs**
```
The registry checks whether a person may request a calculation, but it cannot check
whether the encrypted SNP values came from the registered biological sample. The
contracts calculate a result from the values they receive, including values chosen by
a requester. Restricting an attack to correlated SNP patterns is therefore an analysis
choice, not a restriction enforced by the system.

This study assumes that the patient, laboratory, or data holder prepares the genotype
data correctly before encryption, following Section 2.2. The stored sample record
describes the genome build, variant order, preparation rules, and a cryptographic
fingerprint of that record. It helps document how the input was prepared, but it does
not prove that the encrypted values came from the stated biological sample.
```

**Section 9.2, Limitations and Open Problems ("SNP provenance.")**
```
As specified in Section 6, being allowed to request a calculation does not prove that
the encrypted SNP values came from the registered sample.
```

**Section 9.3, Future Directions**
```
Establishing the source of encrypted SNPs will require a signed laboratory record or a
privacy-preserving proof that links the encrypted values to the registered sample.
```

## Comment 6 — Variant scale

**Abstract (final sentence)**
```
This study evaluates additive PRS models containing up to 5,000 variants; we did not
evaluate genome-wide or clinical use.
```

**Section 1, Introduction (intended-use paragraph)**
```
The intended use is research with additive PRS models containing up to 5,000 variants.
We did not evaluate genome-wide or clinical use, production cost, or private weights
on Sepolia.
```

**Section 2.1, Polygenic Risk Scores**
```
PRS models span a wide range in SNP inclusion depending on construction methodology.
Sparse or clinically oriented models may include hundreds to a few thousand variants,
while genome-wide approaches incorporate tens of thousands to millions of SNPs. We
evaluated bioETH-PRS with models containing up to 5,000 variants. These results do not
establish genome-wide or clinical use.
```

**Section 7.3, Variant Scale, and Table 6**
```
Table 6 reports the number of transactions used for one public model and one sample.
The 100-SNP Sepolia result used the Classic method (stored inputs). The local results
from 100 to 5,000 variants used the Streaming method; 5,000 variants was the largest
bioETH-PRS model evaluated.

Setting             Variants   Method      Tx
Sepolia                  100   Classic     25
Local simulation         100   Streaming   15
Local simulation         500   Streaming   47
Local simulation       1,000   Streaming   88
Local simulation       5,000   Streaming  413
```

**Section 9.2, Limitations and Open Problems ("SNP count ceiling.")**
```
The largest successful calculation chunk in the local simulation contained 21 SNPs for
both public and private weights; the Sepolia limit remains unknown. A public-weight
5,000-variant calculation required 413 local transactions. We did not evaluate larger
bioETH-PRS models or production feasibility.
```

**Section 11, Conclusion (final paragraph)**
```
The results apply to additive PRS models containing up to 5,000 variants. This study
does not establish genome-wide or clinical use, production affordability,
private-weight calculation on Sepolia, or the largest calculation step that Sepolia can
support.
```

## Comment 7 — HEPRS comparison

**Section 3.2, Comparison with HEPRS**
```
Table 1 compares bioETH-PRS and HEPRS by how they handle encrypted data, model size,
runtime, memory, deployment needs, and the result returned. Both compute Equation 1.
HEPRS reports encrypted CKKS results for a much larger model with a designated
evaluator. bioETH-PRS reports a smaller calculation coordinated by public smart
contracts. These contracts reduce reliance on one evaluator, but the system still
depends on the blockchain and fhEVM services.
```

**Table 1 caption**
```
Comparison with HEPRS. HEPRS values come from the published study; bioETH-PRS values
state whether they were observed on Sepolia, observed in the local simulation, or not
measured.
```

**Table 1, dimension rows**
```
Dimension                        HEPRS                                     bioETH-PRS
Designated evaluator             yes; evaluator executes CKKS              no designated evaluator; contracts coordinate the calculation
Remaining dependencies           three-party non-collusion and HE          contracts, blockchain, fhEVM computation, and
                                 software/hardware                         decryption services
Arithmetic scheme                CKKS approximate signed-real arithmetic   TFHE unsigned integers after fixed-point encoding
Encrypted variants evaluated     110,000 in the published study            public: 100 on Sepolia and 100-5,000 locally;
                                                                           private: 100 locally
Runtime                          approximately 4.9 s/person at 110,000     269.320 s to result plus 8.081 s to decrypt at 100 on
                                                                           Sepolia; local times are not comparable
Memory                           3-4 GB/person; up to 130 GB for 1,000     not measured
```

**Section 9.1, HEPRS and bioETH-PRS: Complementary Systems**
```
bioETH-PRS and HEPRS address different questions and are best understood as
complementary rather than competing systems.

HEPRS reports an encrypted PRS calculation for a substantially larger model and
measures CKKS performance under a three-party non-collusion assumption. CKKS
represents approximate signed decimal values without the integer conversion used here.
HEPRS therefore provides the relevant results for large variant counts and measured
FHE performance.

bioETH-PRS instead studies whether public smart contracts can coordinate the
calculation and control result release without a designated evaluator. Its model
settings and transaction history are public, while the system still relies on the
fhEVM services. It also requires many blockchain transactions. The two systems answer
different questions, and these results do not show that either is broadly superior.
```

**Section 11, Conclusion**
```
HEPRS demonstrates encrypted calculation at a larger scale; bioETH-PRS studies how
smart contracts can coordinate a smaller calculation and control result release.
```

## Comment 8 — Cost claims

**Section 7.7, Transactions, Gas, and Fee Examples (observed values)**
```
Table 9 reports the observed transaction use. The Sepolia deployment used four
transactions and 5.892559 million gas, costing 0.0062781714 Sepolia test ETH; the
public-weight calculation used 25 transactions and 20.710271 million gas, costing
0.0252747648 test ETH. These are test-network expenditures, not production prices. In
the local simulation, a public-weight calculation with 100 SNPs using the Streaming
method used 15 transactions and 11.690 million gas, whereas the private-weight
calculation with 100 SNPs used 17 transactions and 23.508 million gas (2.01x).
```

**Section 7.7, Transactions, Gas, and Fee Examples (fee examples)**
```
For illustration only, we multiplied three local gas measurements by hypothetical gas
prices: deployment (5,892,613 gas), the public streaming calculation (11,690,021 gas),
and the private streaming calculation (23,507,880 gas). These are calculated estimates,
not observed costs. At 1 gwei, the respective values are 0.005892613, 0.011690021, and
0.02350788 ETH; at 30 gwei, they are 0.17677839, 0.35070063, and 0.7052364 ETH. We
make no USD conversion or conclusion about affordability or clinical or commercial use.
```

**Table 9 caption**
```
Measured transaction use. The local streaming totals include sample registration and
come from a separate calculation from Table 7; encrypted inputs also cause small gas
variation between otherwise identical calculations.
```

**Section 9.2, Limitations and Open Problems ("Production cost.")**
```
We report gas used by the contracts, Sepolia test-ETH expenditure, and calculated fee
examples using hypothetical gas prices. Production fee schedules, USD cost, memory use,
and operational throughput were not measured, so whether the system is affordable or
practical for clinical or commercial use remains unknown.
```

> Note: the manuscript now contains **no** L1/L2/application-chain cost projection. The
> closing sentence of the current Comment 8 response ("claims about L2 speedup and
> reduced gas costs remain valid...") defends a claim the paper no longer makes. Drop it
> or reframe it as future work.

---

# Reviewer 2

## General assessment

**Section 2.2, Genotype Preprocessing, QC, and Model Alignment**
```
The pre-encryption workflow scores one individual against an already developed model.
Minor-allele frequency and Hardy-Weinberg filtering are therefore cohort- and
model-development quality-control operations performed upstream when effect weights
are derived. The scoring procedure instead checks missingness, genome build, variant
identity and order, allele orientation, and the dosage representation before any value
is encrypted.
```

**Section 4.3, Worked Example (end-to-end order)**
```
At the system level, the data preparer first checks variant identifiers, genome build,
dosage validity, missing values, and effect-allele orientation. Only then are dosage
values and, for private models, weight magnitudes encrypted. The requester selects an
authorized sample and model, submits the encrypted groups for calculation, and receives
either the model-configured raw score or randomized category. The contracts record
permissions and the result recipient, but they do not establish that the encrypted
values came from the stated biological sample.
```

**Section 7.8, Calculation Checks and Responsibilities**
```
The independent comparison summarized in Table 5 shows agreement with Equation 1 for
the studied inputs; it is not a guarantee for every model or deployment. Table 10
explains who is responsible for each part of the result.
```

## Comment 1 — Practical variant scale

**Section 1, Introduction (intended-use paragraph)**
```
The intended use is research with additive PRS models containing up to 5,000 variants.
We did not evaluate genome-wide or clinical use, production cost, or private weights
on Sepolia.
```

**Abstract (final sentence)**
```
This study evaluates additive PRS models containing up to 5,000 variants; we did not
evaluate genome-wide or clinical use.
```

**Section 7.3, Variant Scale, and Table 6**
```
Table 6 reports the number of transactions used for one public model and one sample.
The 100-SNP Sepolia result used the Classic method (stored inputs). The local results
from 100 to 5,000 variants used the Streaming method; 5,000 variants was the largest
bioETH-PRS model evaluated.

Setting             Variants   Method      Tx
Sepolia                  100   Classic     25
Local simulation         100   Streaming   15
Local simulation         500   Streaming   47
Local simulation       1,000   Streaming   88
Local simulation       5,000   Streaming  413
```

**Section 2.4, Programmable Blockchain and fhEVM (HCU)**
```
A per-transaction Homomorphic Computation Unit (HCU) budget limits FHE operations.
In the local simulation, the largest successful calculation chunk contained 21 SNPs
for both model types (Section 7); the Sepolia limit remains unmeasured and is not
inferred from that result. The HCU constraint necessitates chunked computation
strategies for large input vectors.
```

**Section 9.2, Limitations and Open Problems ("SNP count ceiling.")**
```
The largest successful calculation chunk in the local simulation contained 21 SNPs for
both public and private weights; the Sepolia limit remains unknown. A public-weight
5,000-variant calculation required 413 local transactions. We did not evaluate larger
bioETH-PRS models or production feasibility.
```

**Section 9, Discussion (opening paragraph)**
```
We evaluated bioETH-PRS with additive PRS models containing up to 5,000 variants.
Publicly auditable smart contracts reduce reliance on a single designated evaluator,
but the system still depends on the blockchain and on fhEVM services that perform
encrypted calculations, submit transactions, and apply the configured release
permissions. A public-weight 100-SNP calculation completed on Sepolia. Public-weight
calculations with 100-5,000 variants and one private-weight 100-SNP calculation were
evaluated in the local simulation. These results do not establish genome-wide or
clinical use.
```

**Section 11, Conclusion (final paragraph)**
```
The results apply to additive PRS models containing up to 5,000 variants. This study
does not establish genome-wide or clinical use, production affordability,
private-weight calculation on Sepolia, or the largest calculation step that Sepolia can
support.
```

## Comment 2 — Genotype quality control

**Section 2.2, Genotype Preprocessing, QC, and Model Alignment (cohort vs per-person)**
```
The pre-encryption workflow scores one individual against an already developed model.
Minor-allele frequency and Hardy-Weinberg filtering are therefore cohort- and
model-development quality-control operations performed upstream when effect weights
are derived. The scoring procedure instead checks missingness, genome build, variant
identity and order, allele orientation, and the dosage representation before any value
is encrypted.
```

**Section 2.2, Genotype Preprocessing, QC, and Model Alignment (rejection and missing-data rules)**
```
Only diploid hard-call dosages in {0,1,2} are accepted. A non-integer or out-of-range
dosage is rejected rather than clamped, because clamping silently changes the score.
The model must state one of three rules for missing values: reject the sample, use
dosage 0, or use a supplied cohort mean rounded half away from zero to a hard call in
{0,1,2}. An unstated zero is avoided because it would be indistinguishable from a
genuine homozygous-reference call. The declared genotype build must equal the model
build; a mismatch is fatal because the build cannot be inferred from dosage values.
Variant identifiers and order are checked element by element, not merely by vector
length. Duplicate identifiers, multiallelic sites, and indels are rejected; this study
evaluates biallelic SNP hard calls only.
```

**Section 2.2, Genotype Preprocessing, QC, and Model Alignment (preparation record)**
```
The preparation record reports how many variants were matched, missing, imputed,
rejected, or changed for allele orientation.
```

## Comment 3 — Effect-allele alignment

**Section 1, Introduction (definition of Equation 1)**
```
where g_i in {0,1,2} is the dosage of the model-specified effect allele for variant i
and beta_i is the corresponding GWAS effect weight.
```

**Section 2.1, Polygenic Risk Scores**
```
A PRS is the weighted inner product of a patient's effect-allele dosage vector
g in {0,1,2}^N and a GWAS effect weight vector beta in R^N (Eq. 1).
```

**Section 2.2, Genotype Preprocessing, QC, and Model Alignment (alignment rules)**
```
Effect-allele alignment does not reveal encrypted weight magnitudes. Publicly visible
model information supplies each variant identifier, genome build, effect allele, other
allele, and column order, and alignment runs locally before encryption. For a
biallelic, non-palindromic SNP, a dosage already counting the effect allele is
retained; a dosage counting the other allele is transformed as g_effect = 2 - g. A
compatible strand complement is applied before the same decision. Palindromic A/T or
C/G pairs without explicit strand resolution are rejected even on a literal allele
match, because the same label is consistent with opposite strand orientations. Any
remaining incompatible pair is rejected.
```

## Comment 4 — Who guarantees correctness?

**Section 7.2, Agreement with an Independent Calculation**
```
We compared all 200 public-weight results with an independent calculation of
Equation 1: 50 individuals at each of the four model sizes. The mean, root-mean-square,
and maximum absolute errors were all zero; all 200 scores matched exactly; and Pearson
r = 1. This supports the calculation for the studied inputs.
```

**Table 10 (Section 7.8), Responsibilities and remaining limits**
```
Actor/component           Responsibility in this study                          Remaining limit
Data preparer             check genome build, variant order, dosage validity,   the contracts do not prove that the encrypted SNPs
                          missing values, and effect-allele alignment           came from the stated biological sample
Model provider            supply the weights, model details, thresholds, and    calibration or performance in populations that were
                          scientific justification                              not studied
Smart contracts           apply the stated integer calculation and rules        the contracts cannot verify input claims or external
                          about who may use data or receive results             services
fhEVM services            perform the encrypted arithmetic and apply the        blockchain consensus does not independently verify
                          configured release permissions                        the encrypted arithmetic
Independent calculation   compare Equation 1 with 200 studied inputs            agreement is not a proof for other models, inputs,
                                                                                or deployments
Requester                 inspect the published model details and               clinical interpretation beyond the published model
                          blockchain transactions
```

**Section 7.8, Calculation Checks and Responsibilities (closing)**
```
The contracts check who may receive a finalized result, allow only one finalization per
job, keep the thresholds fixed by the model provider, require the minimum threshold gap,
apply query limits, and stop a private-weight calculation when the model provider no
longer allows it. ... The contracts do not establish the source of the biological
sample, clinical validity, calibration, or performance in other populations.
```

## Comment 5 — Explanation of the score calculation

**Section 4.1, The Representation Problem**
```
TFHE arithmetic on the fhEVM operates on unsigned 64-bit integers. GWAS weights beta_i
are signed floating-point values; a naive fixed-point encoding that multiplies by a
scale factor s and rounds produces quantized weights q_i = round(s . beta_i) in Z,
which may be negative. Negative integers cannot be stored in an unsigned 64-bit
integer and would silently wrap under modular overflow, corrupting results without any
observable error.
```

**Section 4.2, Three-Step Unsigned Encoding**
```
We convert the signed decimal weights to nonnegative integers in three steps
(Figure 3). The integer shifts are reversible. Conversion of the original decimal
weights is exact only when the selected scale represents those weights without
rounding, as it does for the data sets used here.
```

**Section 4.3, Worked Example**
```
Consider three genetic variants with scale s = 100. Their weights and effect-allele
dosages are

    beta = [-0.30, 0.10, 0.25],    g = [0, 2, 1].

The plaintext target is

    PRS = 0(-0.30) + 2(0.10) + 1(0.25) = 0.45.

1. Quantize: q = [-30, 10, 25].
2. Weight shift: z_w = 30, u = [0, 40, 55].
3. Accumulate: partialSum = 0.0 + 2.40 + 1.55 = 135; G = 0 + 2 + 1 = 3.
4. Correction: P = 135 - 30.3 = 45.
5. Score shift: z_s = 2.30 = 60; e = 45 + 60 = 105.
6. Decode: PRS = (105 - 60) / 100 = 0.45.
```

**Section 4.3, Worked Example (system-level order)**
```
At the system level, the data preparer first checks variant identifiers, genome build,
dosage validity, missing values, and effect-allele orientation. Only then are dosage
values and, for private models, weight magnitudes encrypted. The requester selects an
authorized sample and model, submits the encrypted groups for calculation, and receives
either the model-configured raw score or randomized category. The contracts record
permissions and the result recipient, but they do not establish that the encrypted
values came from the stated biological sample.
```

**Section 4.2, Three-Step Unsigned Encoding (Step 2 and Step 3 corrections)**
```
The shifted weights u_i >= 0 are stored on-chain. The raw accumulation sum_i g_i u_i
overestimates the true PRS by the constant z_w . sum_i g_i, requiring correction. The
engine tracks the genotype sum G = sum_i g_i as a second encrypted accumulator to
enable this correction.

Even after the weight correction, the corrected sum P = sum_i g_i u_i - z_w G can be
negative for patients with many risk-decreasing alleles.
```

**Section 4.2, Three-Step Unsigned Encoding ("Decoding.")**
```
After an authorized requester decrypts a raw score:

    PRS = (e - z_s) / s.
```

## Comment 6 — Independent validation

**Section 7.2, Agreement with an Independent Calculation**
```
We compared all 200 public-weight results with an independent calculation of
Equation 1: 50 individuals at each of the four model sizes. The mean, root-mean-square,
and maximum absolute errors were all zero; all 200 scores matched exactly; and Pearson
r = 1. This supports the calculation for the studied inputs.
```

**Section 4.3, Worked Example**
```
Consider three genetic variants with scale s = 100. Their weights and effect-allele
dosages are

    beta = [-0.30, 0.10, 0.25],    g = [0, 2, 1].

The plaintext target is

    PRS = 0(-0.30) + 2(0.10) + 1(0.25) = 0.45.

1. Quantize: q = [-30, 10, 25].
2. Weight shift: z_w = 30, u = [0, 40, 55].
3. Accumulate: partialSum = 0.0 + 2.40 + 1.55 = 135; G = 0 + 2 + 1 = 3.
4. Correction: P = 135 - 30.3 = 45.
5. Score shift: z_s = 2.30 = 60; e = 45 + 60 = 105.
6. Decode: PRS = (105 - 60) / 100 = 0.45.
```

**Section 7.8, Calculation Checks and Responsibilities (what consensus does and does not establish)**
```
fhEVM services | perform the encrypted arithmetic and apply the configured release
permissions | blockchain consensus does not independently verify the encrypted
arithmetic

Independent calculation | compare Equation 1 with 200 studied inputs | agreement is not
a proof for other models, inputs, or deployments
```

**Section 7.8, Calculation Checks and Responsibilities (test suite)**
```
These protocol invariants - ACL enforcement, state-machine integrity, the
single-finalize guarantee, the minimum threshold gap, oracle-required mode,
approved-oracle enforcement, rate-limiting window behaviour, and ACL revocation
handling - were validated across 188 automated test cases.
```

**Data Availability Statement and Code Availability Statement**
```
No new datasets were generated. We analyzed the public HEPRS fixtures retained under
test/fixtures/heprs/; the derived validation and measurement records are retained under
evidence/ in the study repository.

The code, fixtures, validation scripts, and result records used in this study are
available at https://github.com/Georgakopoulos-Soares-lab/bioETH-PRS.
```

## Comment 7 — Individual-level agreement

**Table 5 (Section 7.2)**
```
Independent Equation 1 calculation versus decoded public-weight bioETH-PRS in the local
simulation. The study weights were represented without rounding.

SNPs    Scale s      n    MAE/RMSE/max   Exact
  100   3 x 10^6    50        0/0/0      50/50
  500   3 x 10^6    50        0/0/0      50/50
1,000   1 x 10^6    50        0/0/0      50/50
5,000   1 x 10^6    50        0/0/0      50/50
```

**Section 7.2, Agreement with an Independent Calculation (why exact)**
```
The exact agreement is not a general precision result. The four data sets contain 6,600
variant weights plus four leading constant weights. All 6,604 values have at most six
decimal places, and the selected scale represented them without rounding. Other weight
sets may show small rounding differences.
```

**Section 7.2, Agreement with an Independent Calculation (randomized category)**
```
For the randomized risk category at 100 SNPs, all 48 individuals outside the threshold
uncertainty range kept the same category. Two individuals were inside the range and are
reported separately; one changed category in this calculation.
```

---

## Two notes when pasting these in

1. Reviewer 2's Comment 7 refers to "the Empirical Evaluation section," which now
   matches the manuscript heading exactly (Section 7).
2. These quotes are the only places where wording differs from what the current RTR
   asserts; the reported numbers themselves are unchanged.
