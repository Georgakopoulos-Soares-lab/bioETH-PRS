#!/usr/bin/env python3
"""Build the final point-by-point RTR response as a polished Word document."""

from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "docx" / "bioETH-PRS_RTR_response.docx"

BLUE = RGBColor(0x2E, 0x74, 0xB5)
DARK_BLUE = RGBColor(0x1F, 0x4D, 0x78)
GRAY = RGBColor(0x55, 0x55, 0x55)
MUTED = RGBColor(0x6B, 0x72, 0x80)
BLACK = RGBColor(0, 0, 0)


def set_font(run, size: float, *, bold: bool = False, italic: bool = False, color=BLACK) -> None:
    run.font.name = "Calibri"
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Calibri")
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Calibri")
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = color


def set_cell_margins(cell, *, top=80, start=120, bottom=80, end=120) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for edge, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{edge}"))
        if node is None:
            node = OxmlElement(f"w:{edge}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def add_page_field(paragraph) -> None:
    run = paragraph.add_run()
    fld_char = OxmlElement("w:fldChar")
    fld_char.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_char, instr, separate, text, end])
    set_font(run, 9, color=MUTED)


def set_reviewer_box(paragraph) -> None:
    p_pr = paragraph._p.get_or_add_pPr()
    shading = OxmlElement("w:shd")
    shading.set(qn("w:fill"), "F4F6F9")
    p_pr.append(shading)
    borders = OxmlElement("w:pBdr")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), "18")
    left.set(qn("w:space"), "8")
    left.set(qn("w:color"), "2E74B5")
    borders.append(left)
    p_pr.append(borders)


def configure_styles(doc: Document) -> None:
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal.font.size = Pt(11)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.10

    for name, size, color, before, after in (
        ("Heading 1", 16, BLUE, 16, 8),
        ("Heading 2", 13, BLUE, 12, 6),
        ("Heading 3", 12, DARK_BLUE, 8, 4),
    ):
        style = doc.styles[name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = color
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    reviewer = doc.styles.add_style("Reviewer Comment", WD_STYLE_TYPE.PARAGRAPH)
    reviewer.base_style = normal
    reviewer.font.name = "Calibri"
    reviewer._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    reviewer._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    reviewer.font.size = Pt(10.5)
    reviewer.font.italic = True
    reviewer.font.color.rgb = GRAY
    reviewer.paragraph_format.left_indent = Inches(0.18)
    reviewer.paragraph_format.right_indent = Inches(0.08)
    reviewer.paragraph_format.space_before = Pt(4)
    reviewer.paragraph_format.space_after = Pt(8)
    reviewer.paragraph_format.line_spacing = 1.10

    meta = doc.styles.add_style("Response Metadata", WD_STYLE_TYPE.PARAGRAPH)
    meta.base_style = normal
    meta.font.name = "Calibri"
    meta._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    meta._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    meta.font.size = Pt(9.5)
    meta.font.color.rgb = MUTED
    meta.paragraph_format.space_after = Pt(2)
    meta.paragraph_format.line_spacing = 1.0


def add_metadata(doc: Document, label: str, value: str) -> None:
    p = doc.add_paragraph(style="Response Metadata")
    r = p.add_run(f"{label}: ")
    set_font(r, 9.5, bold=True, color=DARK_BLUE)
    r = p.add_run(value)
    set_font(r, 9.5, color=MUTED)


def add_comment_response(
    doc: Document,
    title: str,
    comment: str,
    locations: str,
    response: list[str],
) -> None:
    doc.add_heading(title, level=2)
    quote = doc.add_paragraph(comment, style="Reviewer Comment")
    set_reviewer_box(quote)
    add_metadata(doc, "Manuscript sections", locations)
    heading = doc.add_paragraph(style="Heading 3")
    heading.add_run("Response")
    for text in response:
        doc.add_paragraph(text)


def build() -> None:
    doc = Document()
    configure_styles(doc)
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.right_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    header = section.header
    hp = header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = hp.add_run("RESPONSE TO REVIEWERS  |  bioETH-PRS")
    set_font(r, 9, bold=True, color=MUTED)
    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = fp.add_run("Page ")
    set_font(r, 9, color=MUTED)
    add_page_field(fp)

    title = doc.add_paragraph()
    title.paragraph_format.space_after = Pt(4)
    r = title.add_run("Response to Reviewers")
    set_font(r, 23, bold=True)
    subtitle = doc.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(14)
    r = subtitle.add_run("bioETH-PRS: Confidential Polygenic Risk Scoring with Smart Contracts on an FHE-Enabled Blockchain")
    set_font(r, 14, color=GRAY)
    add_metadata(doc, "Date", "31 July 2026")

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(10)
    r = p.add_run(
        "We thank the reviewers for their careful and constructive comments. The manuscript "
        "now states clearly what bioETH-PRS does, how it was evaluated, and where its limits "
        "remain. The reviewer comments are reproduced exactly below. Each response explains "
        "how the comment was addressed, identifies the relevant manuscript sections, and "
        "summarizes what the results show."
    )
    set_font(r, 11)

    doc.add_heading("Reviewer 1", level=1)
    add_comment_response(
        doc,
        "General assessment",
        "This manuscript presents bioETH-PRS, a privacy-preserving framework for polygenic risk score computation using fully homomorphic encryption on a programmable blockchain. The central idea is to replace the trusted evaluator used in prior encrypted PRS pipelines with auditable smart contracts, while protecting both patient genotypes and GWAS model weights. The manuscript is timely and conceptually interesting, particularly at the intersection of genomic privacy, encrypted computation, and decentralized infrastructure. However, the current evidence remains largely proof-of-concept, and several claims about deployability, privacy guarantees, and clinical feasibility are not yet fully supported.",
        "Abstract; Key Points; Introduction; Discussion; Conclusion",
        [
            "We thank the reviewer and agree that the scope and limits of the study needed to be clearer. We evaluated bioETH-PRS with additive PRS models containing up to 5,000 variants. The manuscript distinguishes results obtained on Sepolia from results obtained in a local simulation and does not treat local results as measurements of Sepolia or production performance.",
            "We also state the services on which the system depends, explain that the contracts cannot confirm that submitted encrypted SNP values came from the registered sample, report a stronger analysis of repeated queries, and provide individual results for all 200 public-weight local comparisons. The manuscript does not claim clinical readiness, commercial practicality, or genome-wide use.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 1 - Sepolia and local evaluation",
        "1. The empirical evaluation relies heavily on a mock coprocessor environment. The reported gas consumption, HCU budget, latency, and protocol behavior are mainly evaluated using a Hardhat in-process mock coprocessor rather than a real fhEVM deployment or public testnet. This substantially weakens the deployment claims. The authors should either provide real-network validation or clearly frame these results as simulation-based estimates.",
        "System design; Where calculations were evaluated; Transactions, gas, and fee examples; Discussion",
        [
            "We thank the reviewer. We completed one public-weight 100-SNP calculation on Sepolia using the Classic method (stored inputs). It required 25 transactions and 20,710,271 gas. The time from submission to the result was 269.3 seconds, followed by 8.1 seconds for decryption. The encoded score was 758,685, exactly matching the independent calculation.",
            "We identify local simulations separately throughout the manuscript. The same Classic method and 25-transaction arrangement used 18,755,864 gas in the local simulation; Sepolia therefore used 10.42% more gas in this comparison. This is a single comparison and is not used as a general conversion between local and public-network results.",
            "The private-weight 100-SNP calculation was evaluated only in the local simulation and was not run on Sepolia. We therefore make no claim about its Sepolia speed, cost, or capacity.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 2 - Trust language",
        "2. The privacy claims should be stated more cautiously. The manuscript argues that bioETH-PRS removes the trusted evaluator assumption. This is a meaningful architectural contribution, but the system still depends on the correctness and availability of the fhEVM stack, smart contracts, ACL/decryption infrastructure, and blockchain consensus. Terms such as “zero trust” or “trustless” should be softened or carefully qualified.",
        "Title; Abstract; Key Points; Introduction; Security assumptions and limits; Discussion; Conclusion",
        [
            "We thank the reviewer and agree. The manuscript says that smart contracts reduce reliance on a single designated evaluator; it does not describe the system as zero-trust or trustless.",
            "The security discussion states the remaining dependencies clearly. The result still depends on correct genotype preparation, a valid model, the smart contracts, the blockchain, and the fhEVM calculation and decryption services. The blockchain records the contract transactions, but it does not by itself prove that the encrypted calculation was performed correctly.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 3 - Differential-privacy framing",
        "3. The noisy output oracle does not provide formal differential privacy. The authors acknowledge that the current mechanism is DP-inspired rather than a calibrated (epsilon, delta)-differential privacy guarantee. Given the sensitivity of genomic data, this limitation should be emphasized more prominently. If the authors wish to retain strong privacy language, they should provide a formal adjacency definition, sensitivity analysis, and privacy-parameter calibration.",
        "Randomized risk category; Limitations; Future work",
        [
            "We thank the reviewer. The manuscript now describes this feature as a randomized risk category and states explicitly that it does not provide differential privacy. A random integer from 0 through B-1 is added before the category is assigned. Its exact mean is (B-1)/2; with B=128, the mean is 63.5 and the contract uses an integer threshold adjustment of 64.",
            "For the 100-SNP data, the category remained unchanged for all 48 individuals whose scores were outside the uncertainty range. Two scores were inside the uncertainty range; one changed category in this calculation. A formal privacy guarantee would require a precise definition of which data sets are compared, how much one input can change the score, how the random value is chosen, and what repeated queries reveal.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 4 - Repeated-query analysis",
        "4. The manuscript estimates that model extraction would require thousands of hours under recommended rate-limiting settings. However, this calculation appears heuristic and does not fully address adaptive querying, multiple-wallet attacks, threshold manipulation, correlated SNP structure, or cross-sample probing. A stronger adversarial analysis is needed before the anti-probing claims can be considered established.",
        "Randomized risk category; Analysis of repeated queries; Limitations",
        [
            "We thank the reviewer. We performed a stronger adversarial analysis covering queries chosen after earlier results, queries chosen in advance, several wallets, different samples, and correlated SNP patterns. An exact score revealed all 20 weights in 20 queries. When the requester changed the threshold after each result, 19 of 20 weights were recovered within the randomization range after 200 queries, and all 20 were first recovered after 260 queries. The local analysis used a fixed sequence of random additions so that it can be repeated; another sequence may give different exact counts.",
            "When all requester-selected queries were chosen in advance, none of the 20 weights was recovered within the randomization range after 320 queries; the correlation was 0.6689 and 65% of signs were correct. When the model provider fixed the thresholds, none was recovered within that range after 320 queries; the correlation was 0.9388 and 70% of signs were correct. Fixed thresholds therefore make precise recovery harder, but they do not completely hide the private weights.",
            "Additional wallets did not increase the number of queries for the same registered sample; different registered samples had separate limits. The model provider decides who may use private weights. When each five-SNP group was assigned the same dosage, the correlation fell to 0.0223. This is not a reliable safeguard because requesters can submit other encrypted values. At the studied limit of three calculations per 1,000 blocks, 260 total queries correspond to calculated times of 288.9 hours with 12-second blocks or 48.1 hours with 2-second blocks. These are calculated examples, not measured network times.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 5 - SNP authenticity",
        "5. The inability to verify submitted encrypted SNPs is a major unresolved security issue. The system verifies access to a registered sample but cannot confirm that the submitted encrypted SNP values faithfully represent that sample. This allows malicious users to submit crafted inputs, which directly affects model-probing and misuse risks. This issue should be moved from a limitation to the main security discussion.",
        "Genotype preprocessing, QC, and model alignment; Security assumptions and limits; Limitations; Future work",
        [
            "We thank the reviewer and agree that this is a central security limitation. The main security discussion now states that the registry checks whether a requester may use a registered sample, but it cannot confirm that the encrypted SNP values came from that sample. A requester who may use the sample can therefore submit chosen values.",
            "The study assumes that the patient, laboratory, or data holder prepares the input correctly before encryption. The accompanying record identifies the genome build, variant order, and preparation rules, but it does not prove the biological origin of the values. Signed confirmation from a laboratory and privacy-preserving proof that an encrypted input matches a registered sample are described as future work.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 6 - Variant scale",
        "6. The prototype is evaluated on 100-5,000 SNP fixtures, whereas many PRS models contain tens of thousands to millions of variants. The authors should more clearly define the intended use case, such as curated small-panel PRS models, and avoid implying general applicability to large-scale clinical PRS deployment.",
        "Abstract; Key Points; Introduction; Variant scale; Discussion; Conclusion",
        [
            "We thank the reviewer. The manuscript now states that this study evaluates additive PRS models containing up to 5,000 variants. The public-weight 100-SNP calculation was completed on Sepolia using the Classic method (stored inputs). In the local simulation, the Streaming method required 15, 47, 88, and 413 transactions for public-weight calculations with 100, 500, 1,000, and 5,000 variants, respectively. The private-weight 100-SNP calculation used the Streaming method and required 17 local transactions.",
            "The public-weight calculation with 5,000 variants was the largest bioETH-PRS calculation evaluated. The manuscript does not claim that the current system is suitable for genome-wide or clinical PRS use.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 7 - HEPRS comparison",
        "7. bioETH-PRS improves the trust model by removing the designated evaluator, but HEPRS supports much larger SNP counts and has different computational advantages. The manuscript should separate claims about privacy architecture, scalability, latency, memory use, and deployment assumptions rather than presenting bioETH-PRS as broadly superior.",
        "Comparison with HEPRS; Discussion; Conclusion",
        [
            "We thank the reviewer. The comparison reports what each system still depends on, its arithmetic method, evaluated variant count, timing, memory use, deployment requirements, released result, and publicly visible information. It does not describe either system as broadly superior.",
            "HEPRS reports encrypted computation with 110,000 variants and measured CKKS performance. bioETH-PRS reports a public-weight 100-SNP calculation on Sepolia using the Classic method (stored inputs) and uses smart contracts to record and control the calculation at a smaller scale. We do not compare local-simulation timing with HEPRS timing, and we state that memory use was not measured for bioETH-PRS.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 8 - Cost claims",
        "8. The cost projections depend on L2-equivalent or application-chain gas pricing and are not based on measured production deployment. Claims that the system may be clinically or commercially practical should be toned down unless supported by real deployment data.",
        "Transactions, gas, and fee examples; Limitations; Conclusion",
        [
            "We thank the reviewer. The cost section reports measured Sepolia gas and test ETH without treating them as production prices or evidence of affordability. Deploying the four contracts on Sepolia used 5,892,559 gas across four transactions and 0.0062781714 Sepolia test ETH. The public-weight 100-SNP calculation used the Classic method (stored inputs), 20,710,271 gas, 25 transactions, and 0.0252747648 test ETH.",
            "In a separate local calculation using the Streaming method, the public-weight 100-SNP calculation used 15 transactions and 11.690 million gas, while the private-weight calculation used 17 transactions and 23.508 million gas, or 2.01 times as much. The fee examples multiply these local gas measurements by stated gas prices. They are calculations, not measured network costs or evidence of affordability.",
        ],
    )

    doc.add_heading("Reviewer 2", level=1)
    add_comment_response(
        doc,
        "General assessment",
        "This manuscript presents bioETH-PRS, a blockchain-based protocol for privacy-preserving polygenic risk scoring (PRS) using TFHE/fhEVM smart contracts. The paper’s main claim is that it removes the need for a trusted evaluator found in prior homomorphic-encryption PRS pipelines by moving orchestration to auditable on-chain contracts. Overall, the paper tries to addresses an important problem at the intersection of genomics, privacy, and decentralized computation. The manuscript is interesting and original. However, I do have several comments.",
        "Introduction; Genotype preprocessing, QC, and model alignment; Representing decimal weights as integers; Evaluation; Discussion; Conclusion",
        [
            "We thank the reviewer for the positive assessment and helpful comments. The manuscript states what the system still depends on, explains genotype quality control and effect-allele alignment, presents the score calculation step by step, and compares the results with an independent calculation of Equation 1. It reports all 200 public-weight local comparisons, and 5,000 variants was the largest bioETH-PRS model evaluated.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 1 - Practical variant scale",
        "1. bioETH-PRS was evaluated only on 100-5000 SNPs, while a real PRS in practice can involve far larger number of SNPs. Although the authors acknowledged that the HCU budget and transaction count made the genome-wide model impractical on current infrastructure. This is still a serious limitation because the method may only apply to a narrow class of PRS models with limited number of SNPs.",
        "Abstract; Introduction; Variant scale; Discussion; Limitations; Conclusion",
        [
            "We thank the reviewer and agree. We evaluated bioETH-PRS with additive PRS models containing up to 5,000 variants. A public-weight 100-SNP calculation was completed on Sepolia using the Classic method (stored inputs). Public-weight local calculations using the Streaming method required 15, 47, 88, and 413 transactions for 100, 500, 1,000, and 5,000 variants, respectively. The public-weight calculation with 5,000 variants was the largest bioETH-PRS calculation evaluated, and the manuscript states that genome-wide and clinical use were not demonstrated.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 2 - Genotype quality control",
        "2. Does bioETH-PRS require quality control of the genotype data, like missing value, minor allele frequency, etc? Please clarify this in the manuscript.",
        "Genotype preprocessing, QC, and model alignment",
        [
            "We thank the reviewer. The manuscript separates checks performed while a PRS model is developed from checks performed when one person is scored. Minor-allele-frequency and Hardy-Weinberg checks require a cohort and therefore occur before a model is published. bioETH-PRS scores one person at a time and cannot perform those cohort-level checks.",
            "Before encryption, the scoring data are checked for missing values, genome build, variant identity and order, allele orientation, duplicate variants, and unsupported variant types. Genotypes must be diploid values of 0, 1, or 2. Invalid values are rejected. The model must also state how missing values are handled; there is no unstated default. Build mismatches, duplicate or reordered variants, multiallelic sites, and insertions or deletions are rejected.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 3 - Effect-allele alignment",
        "3. For some cases, the genotype of a SNP may be coded as 0, 1, 2 in terms of the number of risk alleles; but during the weights derivation, the genotype of that SNP in an independent dataset may be coded as 2, 1, 0 in terms of the number of minor alleles (when the risk allele is not the minor allele). Although we can require the genotype and the weights are provided with consistent coding, how to validate this requirement when they are totally blinded to each other? How does bioETH-PRS handle such situation?",
        "Introduction; Genotype preprocessing, QC, and model alignment",
        [
            "We thank the reviewer. Equation 1 now defines each genotype value as the number of copies of the effect allele specified by the model, not the number of copies of the minor allele. The variant identity, genome build, effect allele, other allele, and model order are available for alignment even when the numerical weights are encrypted. Alignment is performed before the genotype values are encrypted.",
            "If the genotype already counts the effect allele, the value is kept. If it counts the other allele, the value is changed from g to 2-g. If the alleles match on the opposite DNA strand, the strand is corrected first. A/T and C/G variants whose strand cannot be resolved safely are rejected, as are incompatible and non-biallelic variants.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 4 - Who guarantees correctness?",
        "4. How and who to guarantee the final PRS provided by bioETH-PRS is correctly computed? In other words, the bioETH-PRS will eventually provide some numbers. But how do I know I can trust these numbers?",
        "Agreement with an independent calculation; Calculation checks and responsibilities",
        [
            "We thank the reviewer. The manuscript explains who is responsible for each part of the result. The person or laboratory preparing the genotype data is responsible for alignment and quality checks. The model provider is responsible for the weights, thresholds, and scientific validity of the model. The contracts carry out the encoded weighted sum, and the fhEVM services perform encrypted operations and decrypt results only for the intended requester. An independent calculation of Equation 1 provides a numerical comparison.",
            "All 200 public-weight local calculations matched Equation 1 exactly. The public-weight Sepolia calculation also matched the independently calculated encoded score of 758,685. These results show that the calculation was correct for the studied inputs. They do not establish that the genotype values came from the biological sample, that the PRS model is clinically valid, or that it is accurate for populations not studied.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 5 - Explanation of the score calculation",
        "5. The original PRS calculation is simple and easy to understand/interpret, which is a weighted sum of multiple SNPs. The PRS calculation by bioETH-PRS seems more complicated with certain black boxes. Could the authors comment on that?",
        "Representing decimal weights as integers; Worked Example",
        [
            "We thank the reviewer. The explanation now starts with the familiar weighted sum in Equation 1. A three-SNP example gives a score of 0.45 by direct calculation. The manuscript then shows, in order, how the weights are converted to nonnegative integers, combined with the encrypted genotype values, corrected for the conversion, and converted back to the same score of 0.45.",
            "The calculation figure shows the same order: genotype checks and effect-allele alignment, encryption, contract calculation, release to the intended requester, and decoding.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 6 - Independent validation",
        "6. If I need double programming or independent validation of the final calculated PRS, could bioETH-PRS incorporate this?",
        "Where calculations were evaluated; Agreement with an independent calculation; Calculation checks and responsibilities",
        [
            "We thank the reviewer. The manuscript includes one three-SNP worked example that gives the same score before and after the conversion to nonnegative integers. We also compared all 200 public-weight local results with an independent calculation of Equation 1, and every score matched exactly.",
            "The independent calculation and example inputs are provided with the study materials so that the comparison can be repeated. Agreement with an independent calculation is a useful check, although it is not a formal proof of correctness.",
        ],
    )

    add_comment_response(
        doc,
        "Comment 7 - Individual-level agreement",
        "7. In the Empirical Evaluation section, I was expecting to see that the individual PRS calculated by bioETH-PRS is consistent with the PRS calculated from Equation 1. Could the authors provide that information?",
        "Agreement with an independent calculation; Code Availability Statement",
        [
            "We thank the reviewer. We calculated and decoded a separate public-weight result for each individual: 50 individuals for each of the 100-, 500-, 1,000-, and 5,000-variant data sets, for a total of 200. Every result matched the independent Equation 1 calculation exactly. The mean absolute error, root-mean-square error, and maximum absolute error were all zero, and the correlation was 1. All 200 individual comparisons are provided.",
            "The weights in these data sets have at most six decimal places, and the selected scale represented them without rounding. The exact agreement therefore applies to these data sets and does not establish accuracy for models with more precise weights. For the randomized risk category, all 48 individuals outside the uncertainty range kept the same category. Two individuals were inside the range; one changed category in this calculation.",
        ],
    )

    doc.add_heading("Editor's Comments", level=1)
    add_comment_response(
        doc,
        "Editor",
        "(There are no comments.)",
        "Not applicable",
        ["We thank the editor. No separate editorial comments were provided."],
    )

    doc.core_properties.title = "Response to Reviewers - bioETH-PRS"
    doc.core_properties.subject = "Manuscript point-by-point response"
    doc.core_properties.author = "bioETH-PRS authors"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT)
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
