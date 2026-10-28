title: Law & ethics
intro: What is lawful, what is fair and when to stop. This is a practical summary for independent researchers in Ireland, the UK and the EU, with notes for the US. It is not legal advice: if your work could lead to publication of serious allegations or to court, talk to a lawyer early.
updated: 28 October 2026

## The short version
1. **Investigate events, organisations, places, infrastructure and claims.** Never locate, profile, track or expose private individuals.
2. **Collect only what is lawfully public**, without getting round logins, paywalls, CAPTCHAs, geo-blocks or rate limits, and without exploiting a security flaw.
3. **Keep the rules of each platform** you use, and prefer official downloads and APIs to scraping.
4. **Personal data stays personal data when it is public.** Have a lawful basis, collect the minimum, keep it secure and delete it when you are done.
5. **Never deceive real people** to get information: no impersonation, no pretexting, no fake personas befriending your subjects.
6. **Minimise harm** to victims, bystanders, sources and yourself before you publish anything.
7. **Know when to stop and report**: child abuse material, threats to life, a crime in progress, or exposed data you stumbled on.

! Course: The OSINT Training course covers this ground in depth: [Law, terms of service and data protection](course:law-terms-of-service-and-data-protection) and [Doing no harm and staying safe](course:doing-no-harm-and-staying-safe).

## GDPR and a lawful basis for personal data
The EU's [General Data Protection Regulation](https://eur-lex.europa.eu/eli/reg/2016/679/oj) (GDPR), and the UK GDPR that mirrors it, apply to anyone who collects, stores or analyses information about identifiable people, including from public sources. Research on events and organisations still touches personal data: the names of officials, directors and witnesses, faces in videos, uploaders' accounts.

### Choose and record a lawful basis
Article 6 lists six lawful bases. For an independent investigator, one usually fits:
- **Legitimate interests** (Article 6(1)(f)): you have a genuine interest (exposing wrongdoing, verifying a claim, research), the processing is necessary for it, and it does not override the rights of the people concerned. Write down this three-part test (purpose, necessity, balance) before you start; the UK regulator's [lawful basis guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/) includes a template.
- **Public task** applies to public bodies; **consent** rarely works for investigations, because the people you research will not have given it.

### Special and criminal data
- **Special category data** (Article 9) reveals political opinions, religion, ethnicity, health, sexuality or trade-union membership. Investigations of politics and conflict touch it constantly; it needs an extra condition, and usually a national-law exemption.
- **Data about crimes and offences** (Article 10) may only be processed under official authority or where national law allows it (in the UK, a Schedule 1 condition of the Data Protection Act 2018). Allegations of crime are among the riskiest things you can hold.

### Journalism and research exemptions
Article 85 requires each country to balance data protection with freedom of expression, and Article 89 sets safeguards for research and archiving. The exemptions are in national law and are narrower than people assume:
- **Ireland**: the [Data Protection Act 2018](https://www.irishstatutebook.ie/eli/2018/act/7/enacted/en/html), section 43 (freedom of expression and information, including journalism) and section 42 (archiving and research). The regulator is the [Data Protection Commission](https://www.dataprotection.ie/en).
- **UK**: the [Data Protection Act 2018](https://www.legislation.gov.uk/ukpga/2018/12/contents), Schedule 2 Part 5 (journalistic, academic, artistic and literary purposes). The regulator is the ICO.
- The **household exemption** covers purely personal activity. Publishing to the world is not purely personal (EU Court of Justice, _Lindqvist_, 2003).

### Principles in practice
| Principle | In practice |
|---|---|
| Purpose limitation | Write the question down first; collect for that question only |
| Data minimisation | Blur, truncate or leave out what the question does not need: bystanders, children, home addresses |
| Accuracy | Grade sources, correct errors openly, record when you checked |
| Storage limitation | Set a deletion date per case; delete raw personal data when the case closes |
| Security | Encrypted disks and backups, strong unique passwords, two-factor authentication |
| Accountability | Keep the notebook and your lawful-basis note: they show how you decided |

This dashboard helps: it stores the notebook only in your browser, filters sole traders out of company results, does not offer people-search tools, and flags identifying fields in image metadata.

## The Berkeley Protocol
The [Berkeley Protocol on Digital Open Source Investigations](https://humanrights.berkeley.edu/publications/berkeley-protocol-on-digital-open-source-investigations/), from the UC Berkeley Human Rights Center and the UN Human Rights Office (launched in December 2020; the [UN edition](https://digitallibrary.un.org/record/3973652), HR/PUB/20/2, followed in 2022), is the professional standard for open-source work that may become evidence of crimes or human-rights violations.

| Principles | What they ask |
|---|---|
| Professional | Accountability, competency, objectivity, legality and security awareness |
| Methodological | Accuracy, data minimisation, preservation and security by design |
| Ethical | Dignity, humility, inclusivity, independence and transparency |

Its investigation process runs through online inquiries, preliminary assessment, collection, preservation, verification (of the source, the technical data and the content) and investigative analysis. In this dashboard:
- **Collection and preservation**: the [Archives tab](#tab=archives) and the [Kit Guide's chain of custody](#tab=kit&s=chain-of-custody).
- **Verification**: the [Media check](#tab=media), [Domains](#tab=domains) and [Organisations](#tab=orgs) tabs, and the Admiralty grades in the [Case notebook](#tab=notebook).
- **Documentation**: the notebook's activity log and sources table.

## Terms of service
- **Read the terms** of each platform you research. Many forbid automated collection (scraping), fake or duplicate accounts, and downloading content except through their own features.
- **Prefer official routes**: platform downloads, published datasets and APIs. This dashboard uses only public APIs that invite this use, keeps to their published limits (GDELT: one request every five seconds) and opens everything else as a link for you to visit yourself.
- **Breaking terms has consequences**: banned accounts, lost evidence, and lawsuits. In the US, a court found that a data company breached LinkedIn's user agreement by using fake accounts (_hiQ Labs v LinkedIn_, 2022).
- **Accessing what is not public is different again.** Guessing or reusing passwords, using someone else's login or exploiting a security flaw can be crimes under the UK's [Computer Misuse Act 1990](https://www.legislation.gov.uk/ukpga/1990/18/contents), Ireland's [Criminal Justice (Offences Relating to Information Systems) Act 2017](https://www.irishstatutebook.ie/eli/2017/act/11/enacted/en/html) and the US Computer Fraud and Abuse Act, however easy the data is to reach.

## No deception or pretexting
Open-source research observes; it does not trick people.
- **Do not impersonate anyone**: a journalist from another outlet, an official, a customer, a relative.
- **Do not "pretext"**: obtaining information under a false story is unethical, often breaches platform rules, and can be a crime. In the UK, knowingly or recklessly obtaining personal data without the controller's consent is an offence (Data Protection Act 2018, section 170); in the US, pretexting for financial information is banned by the Gramm-Leach-Bliley Act.
- **Do not build fake personas** to befriend, follow, join or message the people or groups you study. Research accounts must be real accounts, registered honestly within the platform's rules, used to observe.
- **Do not interact** with subjects at all: likes, follows and messages alert them and can change what they do.

! If you need to ask: Approaching people openly, as yourself, for comment or an interview is journalism, not OSINT. Do it with consent, honesty about who you are, and a right of reply before publication.

## Minimising harm
Before you publish, ask who could be hurt, how, and whether your question needs the detail that would hurt them.
- **Victims and bystanders**: blur faces and identifying details; avoid gratuitous images of the dead and injured; think about their families seeing your work.
- **The mosaic effect**: harmless facts combined can expose a person or a sensitive place. Review what your publication reveals in total, not item by item.
- **Misidentification destroys lives.** After the 2013 Boston Marathon bombing, online sleuths wrongly named an innocent missing student. Do not name anyone you have not confirmed beyond doubt, and in this scope, do not try to identify private people at all.
- **Amplification**: linking to propaganda or a hoax spreads it. Link to an archived copy, describe rather than embed, and lead with what is true.
- **Sources and colleagues**: your notebook, screenshots and metadata can expose the people who helped you. Strip and secure them.
- **Yourself**: graphic material causes vicarious trauma. Turn off autoplay, mute sound, view footage small or in greyscale, take breaks and talk to someone. Stopping is a professional decision, not a failure.

## When to stop and report
Some discoveries end your research and start a report. Do not investigate further on your own.

| If you find | Do | Report to |
|---|---|---|
| Child sexual abuse material | Stop at once. Do not download, screenshot, save or share it: possession is a crime, whatever the purpose | [Hotline.ie](https://hotline.ie) (Ireland), the [IWF](https://report.iwf.org.uk/en) (UK), the [NCMEC CyberTipline](https://report.cybertip.org) (US), or your country's INHOPE hotline |
| A threat to someone's life, or a crime in progress | Note the address and time; do not engage | Emergency services: 112 or 999 (Ireland, UK), 112 (EU), 911 (US) |
| Terrorist material, or a planned attack | Note the address; do not share the content | The police: in Ireland, [An Garda Síochána](https://www.garda.ie/en/contact-us/); in the UK, [gov.uk/report-terrorism](https://www.gov.uk/report-terrorism) |
| Exposed personal data or a security hole | Stop. Do not download or explore further | The organisation's security contact, or the national cyber security centre ([NCSC Ireland](https://www.ncsc.gov.ie), [NCSC UK](https://www.ncsc.gov.uk)) |
| Evidence of serious crime (trafficking, fraud, war crimes) | Preserve what you lawfully hold; stop collecting | The police; for international crimes, organisations that work with courts ([Europol's reporting page](https://www.europol.europa.eu/report-a-crime) lists national contacts) |
| Threats against you or a source | Document (screenshots, archive links, hashes) and step back | The platform and the police; your editor or organisation if you have one |
| Your work drifting towards a private person | Stop and re-scope the question to the event or organisation | Nobody: change course |

## Before you publish: a checklist
- [ ] Every claim in the report links to a graded source and an archived copy in the notebook.
- [ ] Facts, assessments and assumptions are labelled as such; confidence is stated.
- [ ] Faces of victims, bystanders and children are blurred; no home addresses, phone numbers or personal accounts appear.
- [ ] Serious allegations against a named organisation or official are backed by evidence you can show, and they have had a right of reply.
- [ ] Your lawful-basis note is written, and a deletion date is set for the case's raw personal data.
- [ ] Someone else has checked the key steps (geolocation, identification of organisations, timeline).
