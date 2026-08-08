import { useState, useRef, useEffect, useMemo } from "react";
import { Landscape3D } from "@/components/Landscape3D";
import { type LayerDef, fetchLayers, computeLayerValues } from "@/lib/layers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpdateSegment } from "@/hooks/use-segments";
import { useTheme } from "@/hooks/use-theme";
import { ProjectSettingsDrawer } from "@/components/ProjectSettings";
import { Loader2, Save, Info, RefreshCw, Settings, Sun, Moon, Monitor, Upload, Database, CheckCircle2, Layers, Wrench, Eye, SlidersHorizontal, X } from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// --- Types ---
type GridSegment = {
  id: number;
  xIndex: number;
  zIndex: number;
  xLabel: string;
  zLabel: string;
  value: number;
  description: string | null;
};

const X_LABELS = [
  'DEM-4','DEM-3','DEM-2','DEM-1','DEM 0',
  'DEM+1','DEM+2','DEM+3','DEM+4','Swng/z',
  'Swng/y','Swng/x','Swng 0','Swng\\x','Swng\\y',
  'Swng\\z','GOP+4','GOP+3','GOP+2','GOP+1',
  'GOP 0','GOP-1','GOP-2','GOP-3','GOP-4'
];

const X_MIDDLE_NAMES = [
  `Cluster Summary → Furthest-left activist/Antifa cluster. Strongly anti-ICE, intensely pro-Palestinian/Hamas, strongly supportive of transgender participation in sports and bathrooms and government-funded transition procedures, and willing to justify physical conduct coded at felony level. Uses abolitionist language about policing and prisons, anti-capitalist rhetoric, direct-action politics, hostility toward conventional patriotic symbolism, and frames political conflict as resistance to fascism or state violence. Key Identifiers → Uses explicit Antifa identification or symbols; "anti-fascist," "ACAB," abolition, direct-action or "by any means necessary" language; celebrates or justifies property destruction or assaults when politically motivated; posts anti-ICE messaging; promotes strong pro-Hamas/pro-Palestinian content; and advocates uncompromising transgender-rights positions. Network Profile → Militant anti-fascist activist accounts, black-bloc/direct-action networks, radical abolitionist protest clusters, and online communities combining anti-capitalist, anti-police, anti-ICE and militant Palestine advocacy.`,
  `Cluster Summary → Very-far-left Antifa-oriented online activist cluster. Shares anti-ICE, pro-Hamas/pro-Palestinian and strongly pro-transgender positions with DEM-4, but the distinguishing conduct is online behavior coded at misdemeanor level rather than physical felony conduct. Uses doxxing culture, mass-reporting campaigns, aggressive online shaming, anti-police rhetoric, prison abolition, mutual-aid activism and distrust of mainstream institutions viewed as structurally oppressive. Key Identifiers → Uses Antifa terminology and imagery, frequent anti-ICE and anti-police content, intense Gaza/Hamas advocacy, pro-transgender sports/bathroom and public-funding positions, plus repeated encouragement of online harassment, disruptive digital campaigns, threats or other conduct coded at misdemeanor level. Network Profile → Militant activist social-media clusters, anti-fascist digital organizers, radical protest-support accounts, and networks coordinating online pressure campaigns against political opponents, employers, universities or public agencies.`,
  `Cluster Summary → Hard-left Antifa/activist cohort favoring highly confrontational but nominally legal tactics. Strongly anti-ICE, strongly pro-Hamas/pro-Palestinian, and strongly supportive of transgender participation in sports, bathrooms and publicly funded transition care. Uses aggressive protest, public shaming, institutional complaints, boycotts, labor or tenant organizing, police/prison abolition language and anti-capitalist or anti-corporate framing. Key Identifiers → Uses Antifa or anti-fascist self-description, repeated use of "fascist," "abolition," "systemic oppression," "decolonize," "direct action," and similar activist terminology; organizes petitions, demonstrations, boycotts or complaint campaigns; advocates anti-ICE positions; promotes militant Gaza content; and supports expansive transgender policy. Network Profile → Confrontational campus or street activists, anti-fascist organizers, abolitionist campaigners, legal-protest coordinators and activist networks using sustained but legally framed pressure against institutions or political opponents.`,
  `Cluster Summary → Socialist/BLM/Defund-the-Police cluster positioned just inside the highly activist left. Emphasizes structural racism, redistribution, aggressive police reform or defunding, anti-ICE policy, strong Gaza/Hamas sympathy, expansive transgender policy and government-funded transition procedures. Also includes observed support or tolerance for Sharia-law accommodation and female genital mutilation. Supports reparations, stronger unions, public healthcare and skepticism of capitalism. Key Identifiers → Uses explicit socialist, BLM or Defund-the-Police language; "systemic racism," "racial justice," "abolish ICE," "police violence," "reparations," "equity" and "intersectionality"; promotes pro-Gaza activism; advocates expansive transgender policy; and supports substantial redistribution or public-sector expansion. Network Profile → Democratic-socialist activists, BLM/abolitionist organizers, far-left campus organizations and urban progressive activist networks.`,
  `Cluster Summary → Progressive-left ideological cluster centered on CRT and structural or systemic interpretations of racial inequality. Often described by critics as "woke." Strongly supports DEI, expansive LGBTQ+/transgender protections, Palestinian causes, permissive immigration policy and reduced ICE enforcement. Also includes observed support or tolerance for Sharia law in the United States and female genital mutilation. Emphasizes intersectionality, reparations, decolonization, equity-based institutional policy, stronger social programs and skepticism toward traditional patriotic narratives. Key Identifiers → Frequently discusses Critical Race Theory, systemic racism, white privilege, intersectionality, equity, decolonization, lived experience and marginalized communities; advocates DEI; promotes pro-Gaza messaging; supports anti-ICE/open-border policy; supports transgender participation in sports; criticizes the U.S. flag or conventional nationalism; and uses activist terminology around oppression and power. Network Profile → Highly progressive campus activists, DEI-oriented organizers, democratic-socialist networks, progressive immigration activists, pro-Palestinian activist groups and the activist-left wing of the Democratic coalition.`,
  `Cluster Summary → Strongly progressive Democratic cluster with pronounced anti-Israel positioning. Supports Gaza, DEI, transgender participation in sports, open-border or highly permissive immigration policy and anti-ICE positions. Also includes observed support for Sharia-law accommodation and female genital mutilation. More recognizably Democratic-party aligned than DEM 0 while retaining activist-left foreign-policy and social-policy views. Supports cease-fire activism, restrictions on U.S. military aid to Israel, racial-equity programs, student-debt relief, stronger social spending and criminal-justice reform. Key Identifiers → Combines Democratic identification with repeated criticism of Israel/Zionism, strong pro-Palestinian or cease-fire messaging, DEI/equity terminology, anti-ICE or sanctuary-policy advocacy, transgender-rights messaging, support for broad immigration access and negative reactions to conventional patriotic symbolism. Network Profile → Progressive Democratic activists, pro-Palestinian Democratic organizations, campus Democratic groups, left-wing advocacy nonprofits and voters aligned with the most progressive congressional and municipal factions.`,
  `Cluster Summary → Progressive Democratic Level 2 cluster. Supports Gaza, DEI, transgender participation in sports, anti-ICE and open-border positions, Sharia law in the U.S. and anti-U.S.-flag sentiment. Uses X as an active political-media platform. Less ideologically maximalist than DEM+1 but still clearly left of the Democratic mainstream on immigration, identity and Palestine. Supports climate regulation, abortion rights, student-debt relief, stronger gun control and expanded public healthcare. Key Identifiers → Uses Democratic self-description plus regular pro-Gaza/pro-Palestinian content, DEI and equity language, defense of transgender participation rules, anti-ICE/sanctuary messaging, broad immigration liberalization and criticism of nationalism or traditional flag-centered patriotism. Uses X heavily for political advocacy and movement engagement. Network Profile → Younger progressive Democrats, urban activist-oriented voters, progressive nonprofit staff, campus-centered Democratic networks and social-media-active Democratic issue advocates.`,
  `Cluster Summary → Left-of-center Democratic cluster retaining progressive positions on Gaza, DEI, anti-ICE policy, Sharia-law accommodation and no-cash-bail reform while also consuming some Fox News and actively using X. Remains socially progressive while consuming some cross-ideological media. Supports abortion rights, climate action, stronger gun regulation, organized labor and targeted rather than fully open immigration reform. Key Identifiers → Uses consistent Democratic language, supports DEI and bail reform, posts pro-Gaza content, opposes ICE and uses civil-liberties framing, while occasionally consuming or sharing Fox News material without adopting a broadly Republican agenda. Uses X to engage with both progressive and mainstream political accounts. Network Profile → Center-left urban/suburban Democrats, politically active professionals, union-aligned Democrats and voters combining progressive social policy with a broader media diet than the harder-left cohorts.`,
  `Cluster Summary → Mainstream-to-progressive Democratic cluster with DEI and no-cash-bail support and an explicitly pro-U.S.-military orientation. Consumes limited Fox News and uses X, creating a more cross-partisan media profile. More institutionally comfortable with national defense and less dominated by anti-American or open-border themes. Supports abortion rights, climate action, infrastructure spending, NATO/alliance support, moderate gun regulation and pragmatic immigration reform. Key Identifiers → Shows Democratic affiliation, DEI/equity support, criminal-justice reform and no-cash-bail advocacy combined with favorable statements about U.S. service members, defense capabilities or alliances. Consumes some Fox News and engages on X while otherwise maintaining mainstream Democratic news habits. Network Profile → Defense-oriented Democrats, suburban professionals, establishment-progressive voters, public-sector employees and center-left voters supporting diversity programs while maintaining conventional patriotic and national-security attitudes.`,
  `Cluster Summary → Moderate Democratic -3 cluster at the transition from progressive Democrat to swing voter. Supports DEI and no-cash-bail policy, is pro-U.S.-military, uses X and consumes roughly two hours of Fox News weekly. Culturally center-left but more open to conservative arguments on security, crime, immigration or economics. Supports abortion rights, selective gun restrictions, fiscal caution and incremental rather than sweeping social reform. Key Identifiers → Uses Democratic or Democratic-leaning voting language, supports DEI and justice reform, respects the military and patriotic institutions, watches or discusses Fox News, and reasons issue by issue rather than strictly along party lines. Network Profile → Moderate suburban Democrats, military-family Democrats, older working-class Democrats, independents who usually vote Democratic and professionals mixing liberal social attitudes with centrist security or economic positions.`,
  `Cluster Summary → Moderate Democratic -2 cluster with a visibly mixed ideological pattern: pro-U.S.-flag, pro-closed-border, pro-military and regular Fox News exposure while still supporting no-cash-bail policy and retaining a Democratic lean. Combines patriotic and border-security instincts with selected progressive criminal-justice or social-policy positions. Supports moderate taxation, selective environmental regulation, abortion rights with some limits and bipartisan or pragmatic governance. Key Identifiers → Uses positive U.S.-flag and military language, expresses concern about illegal immigration and border control, maintains Democratic self-identification or voting behavior, supports bail reform, and routinely consumes both mainstream Democratic and conservative media. Network Profile → Centrist suburban Democrats, union households with conservative cultural views, veterans or military-family Democrats and swing-state voters who split tickets or vary their vote by office.`,
  `Cluster Summary → Moderate Democratic -1 cluster approaching the ideological center. Pro-U.S.-flag, favors a closed or tightly controlled border, supports some ICE deportations and consumes about two hours of Fox News weekly, while still supporting no-cash-bail policy and retaining a Democratic orientation. Skeptical of activist-left terminology, supports police funding with reforms, favors moderate fiscal policy and prefers legal immigration over expansive border access. Key Identifiers → Shows Democratic voting history or self-description paired with strong border-control language, selective support for ICE enforcement, positive patriotism, moderate Fox News consumption and rejection of some activist-left positions while maintaining support for no-cash-bail or similar justice reform. Network Profile → Working-class Democrats, culturally moderate minority or immigrant voters, law-and-order Democrats, suburban independents leaning Democratic and voters supporting Democratic economic policy while preferring Republican-style border enforcement.`,
  `Cluster Summary → True swing/center cluster. Pro-U.S.-flag, favors a closed or tightly controlled border, supports some ICE deportations, supports no-cash-bail policy and watches more than roughly two hours of Fox News weekly. Combines center-right enforcement/patriotic cues with center-left criminal-justice reform. Candidate quality, economic conditions and salient issues strongly influence vote choice. Focuses on inflation, public safety, taxes, government competence and political extremism on both sides. Key Identifiers → Uses statements such as "socially liberal, fiscally conservative," "independent," "vote for the person," or dissatisfaction with both parties; uses positive flag/patriotic language; supports border enforcement and selective ICE action; and supports some criminal-justice reform. Network Profile → Independents, ticket-splitters, suburban swing voters, politically heterogeneous working-class households and voters who alternate between Democratic and Republican candidates.`,
  `Cluster Summary → Swing Level X cluster leaning somewhat Republican. Shares pro-U.S.-flag, closed-border, selective ICE-deportation and no-cash-bail positions with the central swing group but consumes heavier Fox News, around four or more hours weekly. Shows greater concern about crime, government spending, taxes and cultural change while retaining one or more center-left positions. Key Identifiers → Uses independent or weak-party identification, consumes conservative media regularly, uses strong border-security and patriotic language, supports partial ICE enforcement, shows skepticism of progressive cultural politics, and still supports selected reforms such as no-cash-bail. Network Profile → Right-leaning independents, former Democrats moving toward Republicans, suburban voters skeptical of both parties and working-class swing voters whose media habits are more conservative than their complete policy bundle.`,
  `Cluster Summary → Moderate Republican transition cluster. Pro-Israel, favors a closed border, opposes Muslim immigration, supports some ICE deportations and supports no-cash-bail policy. Center-right on foreign policy and immigration but not uniformly conservative on criminal justice. Supports police and military institutions, lower taxes, restrained regulation, legal immigration, religious liberty and conventional rather than populist Republican governance. Key Identifiers → Uses Republican-leaning or center-right language, strong Israel support, border-security and immigration-restriction messaging, some support for ICE deportation activity and comparatively moderate rhetoric on institutions or elections. Support for no-cash-bail distinguishes this group from harder-right cohorts. Network Profile → Moderate Republicans, security-focused independents, pro-business conservatives, suburban GOP voters and voters preferring Republican foreign and immigration policy without embracing the party's populist fringe.`,
  `Cluster Summary → Moderate Republican cluster with a stronger conventional conservative pattern: pro-U.S.-flag, pro-Israel, pro-closed-border, opposition to Muslim immigration and support for broad ICE deportations. More consistently Republican than Swng\\y. Emphasizes law-and-order politics, support for police and military institutions, lower taxes, gun rights, religious liberty and skepticism of DEI or expansive progressive social policy. Key Identifiers → Uses overt patriotism, strong Israel support, consistent border-security language, support for broad ICE enforcement, preference for legal over unauthorized immigration, and favorable treatment of police, military and traditional civic institutions. Network Profile → Mainstream conservative suburban voters, older Republican voters, national-security conservatives, small-business Republicans and independents leaning consistently Republican on immigration, public order and foreign policy.`,
  `Cluster Summary → Moderate-to-mainstream Republican cohort with strong pro-Israel/Zionist views, closed-border preferences, opposition to Muslim immigration and support for broad ICE deportations. Reliably conservative without being explicitly Trump/QAnon-defined. Supports strong defense spending, police, lower taxes, less regulation, gun rights, religious liberty, opposition to DEI mandates and market-based economic policy. Key Identifiers → Uses repeated pro-Israel/Zionist commentary, strong border-control and deportation messaging, conventional Republican identification, favorable views of military and police institutions, criticism of progressive identity politics and support for business-oriented conservative policy. Network Profile → Mainstream Republican activists, national-security conservatives, pro-Israel GOP organizations, business conservatives and voters strongly favoring Republican immigration and foreign-policy positions without making Trump or election denial their primary political identity.`,
  `Cluster Summary → Republican Level 3 cluster, reliably conservative on Israel/Zionism, border closure, Muslim-immigration restriction and broad ICE deportations. More partisan than GOP+4 and more likely to interpret issues through Republican-versus-Democratic competition. Opposes DEI and no-cash-bail, supports police, gun rights, tax reductions, fossil-fuel development, parental-rights policies and conservative judicial appointments. Key Identifiers → Shows habitual Republican voting, strong pro-Israel and border-enforcement language, support for large-scale deportation, criticism of progressive cultural policies, favorable discussion of law enforcement and frequent reliance on conservative news or political commentators. Network Profile → Regular Republican primary voters, conservative suburban and exurban voters, small-business owners, evangelical or traditional-values political networks and Republican activists focused on immigration, crime, taxes and cultural issues.`,
  `Cluster Summary → Standard Republican cohort with pro-Israel/Zionist, closed-border, Muslim-immigration-restriction and broad ICE-deportation positions. Conventional partisan Republican rather than specifically Trump-centered or conspiratorial. Supports lower taxes, smaller federal government, less business regulation, gun rights, stronger policing, school choice, limits on abortion and skepticism toward DEI and progressive gender policy. Key Identifiers → Shows consistent Republican voting and self-identification, supports border walls or strict enforcement, posts favorable Israel commentary, supports ICE, uses conventional conservative economic language and emphasizes individual responsibility, parental rights, law and order and limited government. Network Profile → Mainstream GOP voters, Chamber-of-Commerce-style conservatives, suburban/exurban Republicans and voters whose conservatism is primarily policy- and party-based rather than personality-based.`,
  `Cluster Summary → Republican cohort with explicit support for U.S. funding of Israel/Zionism together with closed-border, Muslim-immigration-restriction and broad ICE-deportation positions. More interventionist and alliance-oriented in foreign policy than some populist-right groups. Supports strong U.S. military capability, NATO or allied cooperation when advancing U.S. interests, tax reductions, law-and-order policy, gun rights and opposition to DEI mandates. Key Identifiers → Advocates continued U.S. aid to Israel, uses strong Zionist language, supports strict border and deportation policy, aligns electorally with Republicans and speaks favorably about American military strength, police and traditional institutions. Network Profile → Pro-Israel Republican organizations, defense-oriented conservatives, traditional GOP donors, national-security Republicans and voters combining hard-line immigration policy with active support for U.S. foreign alliances.`,
  `Cluster Summary → Trump-aligned anti-vaccine or vaccine-skeptical Republican cluster. Supports funding Israel/Zionism and broad ICE deportations. Aligns personally with Trump and distrusts public-health authorities, pharmaceutical companies, mandates and official COVID-era policy. Uses "America First" rhetoric, strong border-enforcement messaging, hostility to federal bureaucracy, skepticism toward mainstream media and support for outsider or anti-establishment political figures. Key Identifiers → Uses explicit Trump/MAGA identification; anti-vaccine, anti-mandate or public-health skepticism; strong ICE/deportation messaging; distrust of CDC/FDA or federal experts; and populist themes such as the "deep state," establishment elites, media bias or government overreach. Network Profile → MAGA-oriented voters, anti-mandate activists, populist Republican social-media communities and Trump voters combining immigration enforcement with institutional distrust.`,
  `Cluster Summary → Strong Trump/January 6 sympathetic cluster. Supports or justifies January 6, believes the 2020 election involved meddling and supports broad ICE deportations. Organized around Trump-era grievance and election legitimacy more than GOP 0. Uses claims of media censorship, hostility toward the federal bureaucracy, strong "America First" nationalism, skepticism of mail voting or election administration and opposition to prosecutions of January 6 defendants. Key Identifiers → Uses "Stop the Steal," election-fraud or election-interference language, favorable framing of January 6 participants, repeated claims that Trump was unfairly targeted, strong deportation/border enforcement advocacy and distrust of federal law-enforcement or election institutions. Network Profile → Election-integrity activist networks, strongly MAGA social-media communities, January 6 sympathy groups and Republican voters for whom the 2020 election remains a central political grievance.`,
  `Cluster Summary → QAnon/antisemitic far-right cluster. Combines QAnon identity or narratives, antisemitic content, support for or justification of January 6 and denial of the 2020 election result. Uses "deep state" conspiracy narratives, claims about secret elite networks, globalist conspiracies, coded or explicit hostility toward Jews, distrust of mainstream institutions and highly personalized loyalty to Trump or other anti-establishment figures. Key Identifiers → Uses Q/QAnon slogans, "WWG1WGA," references to hidden cabals or secret trafficking networks, explicit or coded antisemitic narratives, 2020 election-denial claims, January 6 justification and repeated assertions that mainstream media, courts or federal agencies participate in a coordinated conspiracy. Network Profile → QAnon social-media clusters, conspiracy-oriented Telegram/alternative-platform communities, far-right election-denial networks and extremist online communities where QAnon and antisemitic narratives overlap.`,
  `Cluster Summary → QAnon-oriented far-right online misconduct cluster. Shares QAnon and 2020 election-denial themes with GOP-2 but is distinguished by online conduct coded at misdemeanor level rather than primarily antisemitic content. Uses coordinated harassment, doxxing, threatening communications, mass-reporting or intimidation campaigns, "deep state" narratives and aggressive targeting of election officials, journalists, public-health personnel or political opponents. Key Identifiers → Uses repeated QAnon slogans or narratives, 2020 election-denial content, aggressive online campaigns and documented digital conduct meeting the misdemeanor classification. Common markers include "traitor," "deep state," "cabal," "stolen election," "enemy of the people" and calls to expose, punish or overwhelm named institutions or opponents. Network Profile → Militant QAnon social-media networks, election-denial harassment clusters and conspiracy communities moving beyond commentary into coordinated disruptive online behavior.`,
  `Cluster Summary → Furthest-right QAnon/physical-felony cluster. Combines QAnon narratives, strong 2020 election denial, January 6 sympathy or justification and physical conduct coded at felony level. Treats normal political institutions as illegitimate or captured, uses "deep state" conspiracy narratives, revolutionary or insurrectionary rhetoric, highly personalized loyalty to anti-establishment leaders and claims that extraordinary direct action is justified to restore the country. Key Identifiers → Uses explicit QAnon language or symbols, categorical claims that the 2020 election was stolen, positive or justificatory January 6 rhetoric, references to political opponents as traitors or enemies, and documented physical conduct meeting the felony-level criterion. Network Profile → Militant QAnon/election-denial networks, extremist direct-action clusters and conspiracy-oriented groups whose political rhetoric is accompanied by serious physical criminal conduct documented in the research data.`
];

const Z_LABELS = [
  '$20B+ Luck2','$1B Luck1','$50M MDPhD3','$1M MDPhD2','$500K MDPhD1',
  '$400K MD2','$300K MD1','$250K BSJD2','$200K BSJD1','$175K BSPhD2',
  '$150K BSPhD1','$120K BSMS','$100K Trade3','$90K BS2','$80K BS1',
  '$77K BAPhD','$70K Trade2','$65K Trade1','$60K BAMS','$55K BA2',
  '$50K BA1','$45K AS','$40K GED','$35K GED','<$34K GED'
];

const Z_MIDDLE_NAMES = [
  '$20B+ → Educational/training profile: luck-linked entrepreneurship or ownership. Outcome → controlling equity + global scale + rare timing. Observed Cases → global technology and AI founders, multinational conglomerate owners, energy, finance, retail, industrial, and real-estate magnates, sovereign-scale capital allocators, venture pioneers, concentrated shareholders, early equity holders, heirs, and family-office principals whose wealth derives from ownership appreciation rather than wage compensation.',
  '~$1B → Educational/training profile: finance undergraduate or finance-heavy background plus MBA and luck-linked entrepreneurship or ownership. Outcome → scalable enterprise ownership + capital control + liquidity event. Observed Cases → unicorn founders, serial entrepreneurs, hedge-fund founders, private-equity managing partners, elite venture capitalists, investment-banking leaders, commercial real-estate developers, franchise empire builders, major investors, and executives with very large equity stakes. Finance/MBA training → capital-allocation capacity; ownership → dominant income mechanism.',
  '~$50M → Educational/training profile: finance undergraduate or finance-heavy background plus MBA and MD/PhD medical-scientist credential. Outcome → rare education/training combination + ownership leverage + scalable professional platform. Observed Cases → MD/PhDs leading biotechnology companies, surgeons with device patents, dental-platform owners using large practitioner networks, finance MBAs operating hedge funds or private-equity vehicles, hospital-system CEOs, medical-enterprise founders, professional-services owners, celebrity attorneys, senior investment principals, and CEOs with substantial equity.',
  '~$1M → Educational/training profile: finance undergraduate or finance-heavy background plus MBA, MD medical degree, and MD/PhD medical-scientist credential. Outcome → advanced credential + senior market position + ownership or incentive compensation. Observed Cases → specialist physicians, neurosurgeons, plastic surgeons, MD/PhDs directing clinical or biotechnology programs, practice owners, dental-group owners, senior investment bankers, private-equity and hedge-fund professionals, law-firm equity partners, boutique consulting partners, senior technology executives, commercial real-estate operators, software founders, and business owners.',
  '~$500K → Educational/training profile: finance undergraduate or finance-heavy background plus MBA, BS undergraduate degree plus JD, MD medical degree, and MD/PhD medical-scientist credential. Outcome → professional specialization + management responsibility + client, equity, bonus, or distribution income. Observed Cases → medical specialists, MD/PhDs, anesthesiologists, clinical department heads, practice-owning dentists, finance MBA executives, private-equity vice presidents, corporate IP partners, law-firm partners, pharmaceutical R&D directors, technology leaders, hospital administrators, defense contractors, consultants, sales executives, and profitable small-business owners.',
  '~$400K → Educational/training profile: finance undergraduate or finance-heavy background plus MBA, BS undergraduate degree plus JD, MD medical degree, and MD/PhD medical-scientist credential. Outcome → high-demand professional credential + senior role + partnership, commission, equity, or recurring revenue. Observed Cases → experienced physicians, MD/PhDs, senior dentists, finance MBAs, corporate attorneys, private-equity directors, commercial real-estate developers, chief medical officers, engineering managers, cybersecurity leaders, management consultants, enterprise sales leaders, midsize-company executives, and smaller-firm partners.',
  '~$300K → Educational/training profile: finance undergraduate or finance-heavy background plus MBA, BS plus PhD, BA plus JD, BS undergraduate degree plus JD, MD medical degree, and MD/PhD medical-scientist credential. Outcome → advanced technical, medical, legal, financial, or executive labor market position. Observed Cases → physicians, MD/PhDs, senior finance/MBA professionals, experienced attorneys, technical PhDs, principal AI researchers, patent attorneys, engineering directors, corporate controllers, senior consultants, dental specialists, software engineers and managers, enterprise sales professionals, successful contractors, trades-business owners, and corporate directors.',
  '~$250K → Educational/training profile: finance undergraduate or finance-heavy background plus MBA, BS plus PhD, BA plus JD, BS undergraduate degree plus JD, and MD medical degree. Outcome → advanced credential + industry specialization + management, commission, or ownership upside. Observed Cases → JD attorneys, finance MBA professionals, early-career or lower-paid physicians, senior corporate counsel, principal software architects, finance directors, technical PhDs in industry, university STEM leaders, dentists, optometrists, cybersecurity leaders, consultants, commercial pilots, construction or trade-company owners, real-estate professionals, and enterprise salespeople.',
  '~$200K → Educational/training profile: finance undergraduate or finance-heavy background plus MBA, BS plus MS, BS plus PhD, BA plus JD, and BS undergraduate degree plus JD. Outcome → senior professional labor + technical specialization + bonus, overtime, commission, or equity component. Observed Cases → experienced attorneys, finance/MBA professionals, senior software engineers, engineering managers, master\'s-level technical employees, applied PhDs, corporate counsel, senior risk analysts, biotech principal scientists, actuary directors, data scientists, cybersecurity professionals, technical program managers, nurse anesthetists, pilots, consultants, and construction managers.',
  '~$175K → Educational/training profile: skilled trade pathway, finance undergraduate or finance-heavy background plus MBA, BS plus MS, BS plus PhD, BA plus JD, and BS undergraduate degree plus JD. Outcome → advanced credential, senior trade skill, specialized management, or small-business profit. Observed Cases → master trade contractors, senior data scientists, staff engineers, compliance managers, associate attorneys, healthcare administrators, finance professionals, government contractors, technical salespeople, nurse practitioners, registered nurses with overtime, construction managers, specialized pilots, consultants, project managers, cybersecurity professionals, and small-business owners.',
  '~$150K → Educational/training profile: skilled trade pathway, BS degree, registered nurse credential, finance undergraduate or finance-heavy background plus MBA, BS plus MS, BS plus PhD, and BA plus JD. Outcome → professional credential + specialized role + regional wage premium or business income. Observed Cases → PhD-level professionals, attorneys, finance MBA graduates, registered nurses in high-paying specialties, nurse practitioners, physician assistants, senior engineers, software engineers, IT systems architects, university associate professors, accountants, sales professionals, construction supervisors, electricians, plumbers, trade-business owners, government managers, and small-business operators.',
  '~$120K → Educational/training profile: skilled trade pathway, BA plus PhD, BS degree, registered nurse credential, finance undergraduate or finance-heavy background plus MBA, BS plus MS, BS plus PhD, and BA plus JD. Outcome → bachelor\'s/master\'s credential, registered nursing, skilled trade seniority, or public-sector overtime. Observed Cases → engineers, software developers, project managers, accountants, technical salespeople, master electricians, plumbers, business analysts, lab managers, senior teachers, professors, federal employees, police or fire supervisors, construction specialists, finance/MBA employees, early-career attorneys, and stable local business operators.',
  '~$100K → Educational/training profile: skilled trade pathway, BA plus PhD, BS degree, registered nurse credential, finance undergraduate or finance-heavy background plus MBA, BS plus MS, BS plus PhD, and BA plus JD. Outcome → experienced technical labor + licensed trade skill + nursing, public-sector, or overtime premium. Observed Cases → electricians, plumbers, HVAC technicians, elevator technicians, hospital RNs, mid-level software developers, engineers, IT professionals, accountants, teachers, administrators, police officers, firefighters, government specialists, construction supervisors, logistics managers, laboratory specialists, sales representatives, and certified technicians.',
  '~$90K → Educational/training profile: skilled trade pathway, BA plus PhD, BS degree, registered nurse credential, finance undergraduate or finance-heavy background plus MBA, BS plus MS, BS plus PhD, and BA plus JD. Outcome → bachelor\'s-level employment + trade certification + nursing or public-sector overtime. Observed Cases → nurses, skilled tradespeople, construction supervisors, trade supervisors, engineers, IT specialists, software QA engineers, accountants, operations managers, school department heads, police officers, firefighters, technical sales representatives, federal or state employees, laboratory professionals, military or defense personnel, network administrators, and experienced technicians.',
  '~$80K → Educational/training profile: skilled trade pathway, STEM BA, BA plus PhD, BS degree, finance/MBA pathway, BS plus MS, and BA plus JD. Outcome → bachelor\'s degree, moderate-paying master\'s degree, licensed trade work, or operational supervision. Observed Cases → entry-level engineers, staff accountants, teachers with master\'s degrees, university lecturers, IT administrators, paralegal managers, insurance professionals, police officers, firefighters, electricians, plumbers, HVAC technicians, construction workers, sales representatives, government employees, healthcare technicians, and administrative or operational supervisors.',
  '~$77K → Educational/training profile: STEM BA, STEM BA plus MS, skilled trade pathway, non-STEM BA plus PhD, BS degree, registered nurse credential, and non-STEM BA plus JD. Outcome → master\'s-level employment, bachelor\'s professional role, nursing, skilled trade work, or lower-paid advanced-degree pathway. Observed Cases → staff nurses, assistant professors, research staff, HR specialists, senior paralegals, construction foremen, marketing specialists, teachers, laboratory researchers, junior engineers, accountants, IT professionals, social-service managers, government analysts, firefighters, electricians, construction specialists, and certified technicians.',
  '~$70K → Educational/training profile: STEM BA degree, STEM BA plus MS, skilled trade pathway, non-STEM BA plus PhD, BS degree, and non-STEM BA plus JD. Outcome → bachelor\'s/master\'s labor market entry or skilled trade experience. Observed Cases → journeyman plumbers and electricians, public-school teachers, junior paralegals, logistics coordinators, junior accountants, IT support professionals, government analysts, police officers, firefighters, HVAC technicians, construction specialists, healthcare technicians, sales representatives, office managers, technical workers, and public-service or nonprofit advanced-degree holders.',
  '~$65K → Educational/training profile: non-STEM BA degree, non-STEM BA plus MS, skilled trade pathway, non-STEM BA plus PhD, BS degree, and non-STEM BA plus JD. Outcome → early professional employment + trade licensure + moderate experience. Observed Cases → BA/BS graduates, lower-paid master\'s graduates, skilled tradespeople, entry-level analysts, executive assistants, MSW social workers, clinical lab technicians, teachers, government and university employees, junior accountants, IT technicians, electricians, plumbers, mechanics, construction workers, healthcare technicians, sales representatives, administrative supervisors, nonprofit staff, and laboratory employees.',
  '~$60K → Educational/training profile: associate degree, non-STEM BA degree, non-STEM BA plus MS, skilled trade pathway, non-STEM BA plus PhD, and non-STEM BA plus JD. Outcome → associate/bachelor\'s credential + trade experience + administrative or technical role. Observed Cases → research assistants, office managers, entry-level analysts, dental hygienists, trade technicians, police officers, junior account managers, lower-pay teachers, technicians, government employees, electricians, mechanics, construction workers, healthcare support professionals, junior accountants, IT support staff, laboratory employees, sales representatives, and administrative workers.',
  '~$55K → Educational/training profile: unemployment or intermittent work, retired status, GED, associate degree, non-STEM BA degree, non-STEM BA plus MS, and skilled trade pathway. Outcome → GED/associate/bachelor\'s pathway + early trade work + hourly premium, pension, or supplemental income. Observed Cases → administrative coordinators, customer-service supervisors, HVAC technicians, retail store managers, entry-level technicians, junior bookkeepers, teaching assistants, small-office staff, warehouse supervisors, junior IT staff, healthcare support workers, government clerks, logistics employees, retirees, and hourly workers with overtime.',
  '~$50K → Educational/training profile: unemployment or intermittent work, retired status, GED, associate degree, non-STEM BA degree, and non-STEM BA plus MS. Outcome → associate or bachelor\'s credential, experienced GED pathway, retirement income mix, or intermittent employment. Observed Cases → office administrators, junior trade workers, bank tellers or supervisors, medical-records specialists, technicians, retail managers, logistics workers, junior IT support, healthcare assistants, construction workers, mechanics, government clerks, customer-service supervisors, and sales representatives.',
  '~$45K → Educational/training profile: unemployment or intermittent work, retired status, GED, associate degree, non-STEM BA degree, and non-STEM BA plus MS. Outcome → associate degree, entry-level bachelor\'s role, experienced GED pathway, retirement income, or periodic unemployment. Observed Cases → medical assistants, office clerks, retail assistant managers, municipal dispatchers, administrative assistants, entry-level technicians, warehouse or logistics employees, junior healthcare support staff, customer-service staff, clerical workers, construction laborers, mechanics, hospitality supervisors, and entry-level technical or sales employees.',
  '~$40K → Educational/training profile: unemployment or intermittent work, retired status, GED, associate degree, and BA degree. Outcome → GED pathway + entry-level service, clerical, retail, delivery, or warehouse labor. Observed Cases → hospitality workers, warehouse team leads, delivery drivers, retail sales associates, security guards, clerical employees, customer-service representatives, school support workers, healthcare aides, construction laborers, entry-level government employees, junior technicians, retirees with limited earned income, and workers affected by hours, overtime, or seasonality.',
  '~$35K → Educational/training profile: unemployment or intermittent work, retired status, government-support income, and GED. Outcome → low-wage hourly employment + partial-year work + limited retirement or government assistance. Observed Cases → retail workers, food-service employees, call-center representatives, rideshare drivers, home-health aides, warehouse associates, basic clerical staff, cashiers, delivery workers, entry-level construction laborers, hospitality employees, caregivers, GED or high-school graduates, low-pension retirees, and workers whose annual income depends on scheduling.',
  '<$34K → Educational/training profile: unemployment or intermittent work, retired status, and government-support income. Outcome → unemployment, underemployment, part-time low-wage work, limited retirement income, or government assistance. Observed Cases → Social Security-dependent retirees, students with limited earnings, part-time service staff, gig workers, caregivers, cleaners, warehouse employees, seasonal laborers, entry-level retail and food-service workers, clerical workers, hospitality staff, and households combining public benefits, family support, savings, or part-time wages.',
];

function getXLabelColor(xIndex: number): string {
  const hue = 240 - (xIndex / 24) * 240;
  return `hsl(${hue.toFixed(1)}, 90%, 62%)`;
}

function renderConverged(text: string) {
  const parts = text.split(/(Educational\/training profile:|Outcome →|Observed Cases →)/g);
  return (
    <>
      {parts.map((part, i) =>
        i === 0
          ? <strong key={i}>{part}</strong>
          : part === 'Educational/training profile:' || part === 'Outcome →' || part === 'Observed Cases →'
            ? <strong key={i}>{part}</strong>
            : <span key={i}>{part}</span>
      )}
    </>
  );
}

function renderPolitical(text: string) {
  const phrases = ['Cluster Summary →', 'Key Identifiers →', 'Network Profile →'];
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    let earliestIdx = -1;
    let earliestPhrase = '';
    for (const phrase of phrases) {
      const idx = remaining.indexOf(phrase);
      if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
        earliestIdx = idx;
        earliestPhrase = phrase;
      }
    }
    if (earliestIdx === -1) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
    if (earliestIdx > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, earliestIdx)}</span>);
    }
    parts.push(<strong key={key++}>{earliestPhrase}</strong>);
    remaining = remaining.slice(earliestIdx + earliestPhrase.length);
  }
  return parts;
}

export default function Home() {
  const [selectedSegment, setSelectedSegment] = useState<GridSegment | null>(null);
  const [cameraPos, setCameraPos] = useState<{x:number,y:number,z:number}>({ x: -25, y: 30, z: 25 });
  const [editValue, setEditValue] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showAdjustSkew, setShowAdjustSkew] = useState(false);
  const [skewLayerId, setSkewLayerId] = useState<number | null>(null);
  const [skewInB, setSkewInB] = useState(0);
  const [skewInT, setSkewInT] = useState(5);
  const [skewOutB, setSkewOutB] = useState(0);
  const [skewOutT, setSkewOutT] = useState(5);
  const [skewApplying, setSkewApplying] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameName2, setRenameName2] = useState("");
  const [renameDesc, setRenameDesc] = useState("");
  const [renameIcon, setRenameIcon] = useState<string | null>(null);
  const [renameIconOn, setRenameIconOn] = useState(false);
  const [renameApplying, setRenameApplying] = useState(false);
  const [surfMode, setSurfMode] = useState(false);
  const [layerMode, setLayerMode] = useState<'layers' | 'details'>('details');
  const [layerDefs, setLayerDefs] = useState<LayerDef[]>([]);
  const [activeLayers, setActiveLayers] = useState<number[]>([]);
  const isAdmin = import.meta.env.DEV;

  // Fetch layers from API once on mount
  useEffect(() => {
    fetchLayers()
      .then(defs => {
        setLayerDefs(defs);
        setActiveLayers(defs.filter(l => l.active).map(l => l.id));
      })
      .catch(console.error);
  }, []);

  const effectiveValues = useMemo(() => {
    if (layerDefs.length === 0) return undefined; // not yet loaded — use raw DB values
    const allGrids = layerDefs.map(l => l.gridValues);
    const activeGrids = activeLayers
      .map(id => layerDefs.find(l => l.id === id)?.gridValues)
      .filter((g): g is number[][] => !!g);
    if (activeGrids.length === 0) {
      // All layers off — terrain flat (all zero)
      const zeros = new Map<string, number>();
      for (let x = 0; x < 25; x++) for (let z = 0; z < 25; z++) zeros.set(`${x},${z}`, 0);
      return zeros;
    }
    // allGrids provides the fixed normalization reference so single-layer
    // views show proportional heights, not re-normalized to full 0-100.
    return computeLayerValues(activeGrids, allGrids);
  }, [activeLayers, layerDefs]);

  // Raw (un-normalized) sum of active layer values per cell — used for People count display
  const rawLayerValues = useMemo(() => {
    if (layerDefs.length === 0 || activeLayers.length === 0) return undefined;
    const activeGrids = activeLayers
      .map(id => layerDefs.find(l => l.id === id)?.gridValues)
      .filter((g): g is number[][] => !!g);
    if (activeGrids.length === 0) return undefined;
    const result = new Map<string, number>();
    for (let r = 0; r < 25; r++) {
      const zIndex = 24 - r;
      for (let c = 0; c < 25; c++) {
        const sum = activeGrids.reduce((a, g) => a + (g[r]?.[c] ?? 0), 0);
        result.set(`${c},${zIndex}`, sum);
      }
    }
    return result;
  }, [activeLayers, layerDefs]);

  const toggleLayer = (id: number) =>
    setActiveLayers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Ranked layer values at the selected block — used in Results panel
  const layerResultsAtBlock = useMemo(() => {
    if (!selectedSegment || activeLayers.length === 0 || layerDefs.length === 0) return [];
    const row = 24 - selectedSegment.zIndex;
    const col = selectedSegment.xIndex;
    const entries = activeLayers.map(id => {
      const layer = layerDefs.find(l => l.id === id);
      if (!layer) return null;
      return { id, name: layer.name, name2: layer.name2 ?? null, description: layer.description ?? null, icon: layer.icon ?? null, value: layer.gridValues[row]?.[col] ?? 0 };
    }).filter((r): r is { id: number; name: string; name2: string|null; description: string|null; icon: string|null; value: number } => !!r);
    const total = entries.reduce((s, r) => s + r.value, 0);
    return entries
      .map(r => ({ ...r, pct: total > 0 ? Math.round(r.value / total * 100) : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [selectedSegment, activeLayers, layerDefs]);

  const { data: projectSettingsData = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then(r => r.json()),
  });

  const projectTitle = projectSettingsData["project_title"] || "";
  const formatDate = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y}`;
  };
  const dateStart = projectSettingsData["date_range_start"] || "";
  const dateEnd = projectSettingsData["date_range_end"] || "";
  const dateLabel = dateStart || dateEnd
    ? [dateStart, dateEnd].filter(Boolean).map(formatDate).join(" – ")
    : "";
  const updateMutation = useUpdateSegment();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const blockBarColor = selectedSegment
    ? isDark
      ? `hsl(${Math.round(240 - (selectedSegment.xIndex / 24) * 240)}, 90%, 60%)`
      : `hsl(${Math.round(240 - (selectedSegment.xIndex / 24) * 240)}, 100%, 48%)`
    : '#a8d4d2';
  const detailBgStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(${isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)'}, ${isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)'}), url(/detail-bg.png)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch this segment's dedicated dataset
  const segmentDataQuery = useQuery<{ segmentId: number; rows: { response_category: string; count: number }[]; total: number }>({
    queryKey: ['/api/segments', selectedSegment?.id, 'data'],
    enabled: !!selectedSegment,
  });

  // Upload CSV data mutation
  const uploadDataMutation = useMutation({
    mutationFn: async (rows: { response_category: string; count: number }[]) => {
      if (!selectedSegment) throw new Error("No segment selected");
      return apiRequest("POST", `/api/segments/${selectedSegment.id}/data`, { rows });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/segments', selectedSegment?.id, 'data'] });
      queryClient.invalidateQueries({ queryKey: [api.segments.list.path] });
      toast({ title: "Dataset uploaded", description: `Block ${selectedSegment?.id} data updated successfully.` });
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Could not save the dataset. Check CSV format.", variant: "destructive" });
    },
  });

  // Parse a CSV file into rows
  const parseCSV = (text: string): { response_category: string; count: number }[] => {
    const lines = text.trim().split(/\r?\n/);
    const rows: { response_category: string; count: number }[] = [];
    for (const line of lines) {
      if (!line.trim() || line.startsWith('#')) continue;
      const parts = line.split(',');
      if (parts.length < 2) continue;
      const count = parseInt(parts[parts.length - 1].trim(), 10);
      const response_category = parts.slice(0, parts.length - 1).join(',').trim();
      if (response_category && !isNaN(count)) {
        rows.push({ response_category, count });
      }
    }
    return rows;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast({ title: "No data found", description: "CSV must have rows like: category name, count", variant: "destructive" });
        return;
      }
      uploadDataMutation.mutate(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Handle selection from 3D view
  const handleSelect = (segment: GridSegment) => {
    setSelectedSegment(segment);
    setEditValue(segment.value.toString());
  };

  const handleSave = () => {
    if (!selectedSegment) return;
    const newValue = parseInt(editValue, 10);
    if (isNaN(newValue)) return;

    updateMutation.mutate(
      { id: selectedSegment.id, value: newValue },
      {
        onSuccess: () => {}
      }
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row overflow-hidden bg-background text-foreground">
      
      {/* 3D Viewport - Takes dominant space */}
      <div className="flex-1 flex flex-col min-h-0 order-2 md:order-1">
       <div className="flex-1 relative min-h-0">
        <Landscape3D onSelectSegment={handleSelect} isDark={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)} surfMode={surfMode} effectiveValues={effectiveValues} rawLayerValues={rawLayerValues} onCameraChange={(x,y,z) => setCameraPos({x,y,z})} />
        
        {/* Header Overlay — left: minedICE logo, right: project title + dates */}
        <div className="absolute top-4 left-6 right-6 z-10 pointer-events-none flex items-start justify-between">
          {/* Left — brand */}
          <div>
            {(() => {
              const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              return (
                <img
                  src={isDarkMode ? '/minedice-logo-dark.png' : '/minedice-logo-light.png'}
                  alt="minedICE"
                  className="h-6 md:h-8 w-auto object-contain"
                />
              );
            })()}
            <p className={`font-mono mt-1 text-xs tracking-widest uppercase ${theme === 'light' ? 'text-gray-500' : 'text-white/50'}`}>
              Module Interaction & Visualization
            </p>
          </div>

          {/* Right — project title + date range (only when set) */}
          {projectTitle && (
            <div className="text-right">
              <img
                src={theme === 'light' ? '/minedice-logo-light.png' : '/minedice-logo-dark.png'}
                alt={projectTitle}
                className="h-6 md:h-8 w-auto object-contain opacity-0 absolute"
                aria-hidden
              />
              <p className={`font-mono text-base md:text-lg font-bold tracking-widest uppercase ${theme === 'light' ? 'text-gray-700' : 'text-white/90'}`}>
                {projectTitle}
              </p>
              {dateLabel && (
                <p className={`font-mono mt-1 text-xs tracking-widest uppercase ${theme === 'light' ? 'text-gray-500' : 'text-white/50'}`}>
                  {dateLabel}
                </p>
              )}
            </div>
          )}
        </div>
       </div>{/* end inner terrain */}

       {/* ── Bottom Bar — only when a segment is selected */}
       {selectedSegment && (
         <div className="flex border-t border-border bg-card shrink-0">
           {/* Left: LAYERS/DETAILS tabs + controls + stats pills */}
            <div className="flex flex-col p-2 justify-between border-r border-border" style={{ width: '28%' }}>
              {/* Row 1 — Tabs (pinned top) */}
              <div className="flex items-center bg-muted rounded-lg p-0.5 text-[10px] font-semibold tracking-wider shrink-0">
                <button
                  onClick={() => setLayerMode('layers')}
                  className={`flex-1 py-1 rounded-md transition-colors ${layerMode === 'layers' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >LAYERS</button>
                <button
                  onClick={() => setLayerMode('details')}
                  className={`flex-1 py-1 rounded-md transition-colors ${layerMode === 'details' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >DETAILS</button>
              </div>
              {/* Row 2 — Dark / Light */}
              <div className="flex gap-1">
                <button onClick={() => setTheme('dark')} className={`flex-1 flex items-center justify-center gap-0.5 text-[9px] font-mono py-0.5 px-1 rounded border transition-colors ${theme === 'dark' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  <Moon className="w-2.5 h-2.5" /> Dark
                </button>
                <button onClick={() => setTheme('light')} className={`flex-1 flex items-center justify-center gap-0.5 text-[9px] font-mono py-0.5 px-1 rounded border transition-colors ${theme === 'light' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  <Sun className="w-2.5 h-2.5" /> Light
                </button>
              </div>
              {/* Row 3 — Surf Mode / Sys */}
              <div className="flex gap-1">
                <button onClick={() => setSurfMode(v => !v)} className={`flex-1 flex items-center justify-between text-[9px] font-mono py-0.5 px-1.5 rounded border transition-colors ${surfMode ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  <span className="flex items-center gap-0.5"><Layers className="w-2.5 h-2.5" /> Surf Mode</span>
                  <span className={`w-6 h-3 rounded-full flex items-center px-0.5 transition-colors ${surfMode ? 'bg-primary' : 'bg-muted'}`}>
                    <span className={`w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${surfMode ? 'translate-x-3' : 'translate-x-0'}`} />
                  </span>
                </button>
                <button onClick={() => setTheme('system')} className={`flex-1 flex items-center justify-center gap-0.5 text-[9px] font-mono py-0.5 px-1 rounded border transition-colors ${theme === 'system' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  <Monitor className="w-2.5 h-2.5" /> Sys
                </button>
              </div>
              {/* Row 4 — ID:SEG / People */}
              <div className="flex gap-1">
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5 flex-1 justify-center">ID:SEG {selectedSegment.id}:[{selectedSegment.xIndex},{selectedSegment.zIndex}]</Badge>
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5 flex-1 justify-center">People:{rawLayerValues?.get(`${selectedSegment.xIndex},${selectedSegment.zIndex}`) ?? selectedSegment.value}</Badge>
              </div>
              {/* Row 5 — POS / CamPos (pinned bottom) */}
              <div className="flex gap-1">
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5 flex-1 justify-center">POS:[{selectedSegment.xIndex},{selectedSegment.zIndex}]</Badge>
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5 flex-1 justify-center">CamPos:[{cameraPos.x},{cameraPos.y},{cameraPos.z}]</Badge>
              </div>
            </div>
           {/* Right: Political Domain + Income/Education */}
           <div className="flex flex-col gap-2 p-3 flex-1">
             <div className="p-3 rounded-lg border border-border/40 flex-1 flex flex-col min-h-0" style={detailBgStyle}>
               <div className="text-xs leading-snug overflow-y-auto" style={{ maxHeight: '80px' }}>
                 <span className="uppercase tracking-wider font-bold text-muted-foreground">Political Domain (X)</span>{' '} 
                 <span className="text-foreground/80"><strong style={{ color: getXLabelColor(selectedSegment.xIndex) }}>{X_LABELS[selectedSegment.xIndex] || selectedSegment.xLabel}</strong>{' → '}{renderPolitical(X_MIDDLE_NAMES[selectedSegment.xIndex] || '')}</span>
               </div>
             </div>
             <div className="p-3 rounded-lg border border-border/40 flex-1 flex flex-col min-h-0" style={detailBgStyle}>
               <div className="text-xs leading-snug overflow-y-auto" style={{ maxHeight: '80px' }}>
                 <span className="uppercase tracking-wider font-bold text-muted-foreground">Income / Education (Z)</span>{' '}
                 <span className="text-foreground/80">{renderConverged(Z_MIDDLE_NAMES[selectedSegment.zIndex] || '')}</span>
               </div>
             </div>
           </div>
         </div>
       )}
      </div>{/* end left column */}

      {/* Sidebar Control Panel */}
      <div className="w-full md:w-[460px] lg:w-[530px] h-full bg-card border-l border-border flex flex-col shadow-2xl z-20 order-1 md:order-2">
        <div className="px-3 py-1.5 border-b border-border bg-black/20 relative">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-primary" />
              Inspector
            </h2>
            <div className="flex items-center gap-1">
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${showAdjustSkew ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Adjust Skew (admin only)"
                  onClick={() => { setShowAdjustSkew(v => !v); setSkewLayerId(null); }}  
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Project Settings (admin only)"
                  onClick={() => setShowProjectSettings(true)}
                >
                  <Wrench className="w-3.5 h-3.5" />
                </Button>
              )}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-settings"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="w-4 h-4" />
              </Button>
              {showSettings && (
                <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
                <div className="absolute right-0 top-10 z-50 bg-card border border-border rounded-lg shadow-2xl p-3 min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                    <div className="flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold">Settings</span>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">Theme</p>
                  <div className="space-y-1">
                    <button
                      data-testid="button-theme-dark"
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${theme === 'dark' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'}`}
                      onClick={() => { setTheme('dark'); setShowSettings(false); }}
                    >
                      <Moon className="w-4 h-4" /> Dark
                    </button>
                    <button
                      data-testid="button-theme-light"
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${theme === 'light' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'}`}
                      onClick={() => { setTheme('light'); setShowSettings(false); }}
                    >
                      <Sun className="w-4 h-4" /> Light
                    </button>
                    <button
                      data-testid="button-theme-system"
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${theme === 'system' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'}`}
                      onClick={() => { setTheme('system'); setShowSettings(false); }}
                    >
                      <Monitor className="w-4 h-4" /> System
                    </button>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">View</p>
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors"
                      onClick={() => setSurfMode(v => !v)}
                    >
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4" /> Surf Mode</span>
                      <span className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${surfMode ? 'bg-primary' : 'bg-muted'}`}>
                        <span className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${surfMode ? 'translate-x-5' : 'translate-x-0'}`} />
                      </span>
                    </button>
                  </div>
                </div>
                </>
              )}
            </div>
            </div>{/* end flex items-center gap-1 */}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-3">

          {/* Sliders panel — Adjust Skew + Rename Layers side by side */}
          {isAdmin && showAdjustSkew && (
            <div className="flex flex-col gap-3 animate-in slide-in-from-right-4 duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold">Layer Tools</span>
                </div>
                <button onClick={() => { setShowAdjustSkew(false); setSkewLayerId(null); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Shared layer list */}
              <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                {layerDefs.length === 0 && <p className="text-[10px] text-muted-foreground font-mono px-1">No layers found.</p>}
                {layerDefs.map(layer => {
                  const selected = skewLayerId === layer.id;
                  return (
                    <button
                      key={layer.id}
                      onClick={() => {
                        setSkewLayerId(layer.id);
                        setRenameValue(layer.name);
                        setRenameName2((layer as any).name2 ?? "");
                        setRenameDesc((layer as any).description ?? "");
                        const ic = (layer as any).icon ?? null;
                        setRenameIcon(ic);
                        setRenameIconOn(!!ic);
                        try {
                          const p = layer.params ? JSON.parse(layer.params) : null;
                          setSkewOutB(p?.outsideBottom ?? 0);
                          setSkewOutT(p?.outsideTop    ?? 5);
                          setSkewInB(p?.insideBottom   ?? 0);
                          setSkewInT(p?.insideTop      ?? 5);
                        } catch {
                          setSkewOutB(0); setSkewOutT(5);
                          setSkewInB(0);  setSkewInT(5);
                        }
                      }}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-left transition-colors ${selected ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#a8d4d2' }} />
                      <span className="text-[10px] uppercase tracking-wider font-medium flex-1 truncate">{layer.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Controls — shown when a layer is selected */}
              {skewLayerId !== null && (
                <div className="flex flex-col gap-2">
                  {/* Adjust Skew — full width */}
                  <div className="flex flex-col gap-2 border border-border rounded-lg p-2.5 bg-muted/30">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Adjust Skew</p>
                    <div className="flex gap-2">
                      {/* Outside shape */}
                      <div className="flex-1 border border-border rounded-md p-1.5 bg-background">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Outside — RANDBETWEEN</p>
                        <div className="flex items-center gap-1">
                          <div className="flex-1">
                            <Label className="text-[9px] text-muted-foreground uppercase">Bottom</Label>
                            <Input type="number" min={0} step="any" value={skewOutB} onChange={e => setSkewOutB(Number(e.target.value))} className="h-7 text-xs font-mono" />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[9px] text-muted-foreground uppercase">Top</Label>
                            <Input type="number" min={0} step="any" value={skewOutT} onChange={e => setSkewOutT(Number(e.target.value))} className="h-7 text-xs font-mono" />
                          </div>
                        </div>
                      </div>
                      {/* Inside shape */}
                      <div className="flex-1 border border-border rounded-md p-1.5 bg-background">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Inside — RANDBETWEEN</p>
                        <div className="flex items-center gap-1">
                          <div className="flex-1">
                            <Label className="text-[9px] text-muted-foreground uppercase">Bottom</Label>
                            <Input type="number" min={0} step="any" value={skewInB} onChange={e => setSkewInB(Number(e.target.value))} className="h-7 text-xs font-mono" />
                          </div>
                          <div className="flex-1">
                            <Label className="text-[9px] text-muted-foreground uppercase">Top</Label>
                            <Input type="number" min={0} step="any" value={skewInT} onChange={e => setSkewInT(Number(e.target.value))} className="h-7 text-xs font-mono" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={skewApplying}
                      className="w-full h-7 text-[10px] uppercase tracking-wider"
                      onClick={async () => {
                        setSkewApplying(true);
                        try {
                          const res = await fetch(`/api/layers/${skewLayerId}/skew`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ insideBottom: skewInB, insideTop: skewInT, outsideBottom: skewOutB, outsideTop: skewOutT }),
                          });
                          const updated = await res.json();
                          setLayerDefs(prev => prev.map(l => l.id === skewLayerId ? { ...l, gridValues: updated.gridValues } : l));
                        } finally {
                          setSkewApplying(false);
                        }
                      }}
                    >
                      {skewApplying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Apply
                    </Button>
                  </div>

                  {/* Rename Layer — full width, below */}
                  <div className="flex flex-col gap-2 border border-border rounded-lg p-2.5 bg-muted/30">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Rename Layer</p>

                    {/* Icon toggle + upload */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Label className="text-[9px] text-muted-foreground uppercase">Icon</Label>
                        <button
                          type="button"
                          onClick={() => setRenameIconOn(v => !v)}
                          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${renameIconOn ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                        >
                          <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${renameIconOn ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                      {renameIconOn && (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <label className="flex flex-col items-center justify-center w-12 h-12 rounded-full border-2 border-dashed border-border bg-background cursor-pointer overflow-hidden shrink-0">
                              {renameIcon
                                ? <img src={renameIcon} className="w-full h-full object-cover rounded-full" />
                                : <span className="text-[9px] text-muted-foreground text-center leading-tight">Upload</span>}
                              <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (!['image/jpeg', 'image/png'].includes(file.type)) {
                                  alert('Only JPG or PNG files are allowed.');
                                  e.target.value = '';
                                  return;
                                }
                                const img = new Image();
                                const url = URL.createObjectURL(file);
                                img.onload = () => {
                                  URL.revokeObjectURL(url);
                                  if (img.width > 150 || img.height > 150) {
                                    alert(`Image must be 150×150 px or smaller (yours is ${img.width}×${img.height}).`);
                                    e.target.value = '';
                                    return;
                                  }
                                  const reader = new FileReader();
                                  reader.onload = ev => setRenameIcon(ev.target?.result as string);
                                  reader.readAsDataURL(file);
                                };
                                img.src = url;
                              }} />
                            </label>
                            <span className="text-[9px] text-muted-foreground">Click circle to upload</span>
                          </div>
                          <p className="text-[9px] font-semibold" style={{ color: '#8b0000' }}>
                            JPG or PNG only · max 150×150 px · square images work best
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Name (1) — main */}
                    <div>
                      <Label className="text-[9px] text-muted-foreground uppercase">Name (1) — Main</Label>
                      <Input
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        className="h-7 text-xs font-mono uppercase"
                        placeholder="LAYER NAME…"
                      />
                    </div>

                    {/* Name (2) — short subtitle */}
                    <div>
                      <Label className="text-[9px] text-muted-foreground uppercase">Name (2) — Subtitle <span className="normal-case">(max 20 chars)</span></Label>
                      <Input
                        value={renameName2}
                        onChange={e => setRenameName2(e.target.value.slice(0, 20))}
                        className="h-7 text-xs font-mono"
                        placeholder="Short subtitle…"
                        maxLength={20}
                      />
                      <span className="text-[9px] text-muted-foreground">{renameName2.length}/20</span>
                    </div>

                    {/* Description — long */}
                    <div>
                      <Label className="text-[9px] text-muted-foreground uppercase">Description <span className="normal-case">(max 200 chars)</span></Label>
                      <textarea
                        value={renameDesc}
                        onChange={e => setRenameDesc(e.target.value.slice(0, 200))}
                        maxLength={200}
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Description…"
                      />
                      <span className="text-[9px] text-muted-foreground">{renameDesc.length}/200</span>
                    </div>

                    <Button
                      size="sm"
                      disabled={renameApplying || !renameValue.trim()}
                      className="w-full h-7 text-[10px] uppercase tracking-wider"
                      onClick={async () => {
                        setRenameApplying(true);
                        try {
                          const res = await fetch(`/api/layers/${skewLayerId}/rename`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              name: renameValue.trim(),
                              name2: renameName2.trim() || undefined,
                              description: renameDesc.trim() || undefined,
                              icon: renameIcon ?? undefined,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            toast({ title: "Save failed", description: data.message ?? "Unknown error", variant: "destructive" });
                            return;
                          }
                          setLayerDefs(prev => prev.map(l => l.id === skewLayerId ? { ...l, name: data.name, name2: data.name2, description: data.description, icon: data.icon } : l));
                          toast({ title: "Layer saved", description: `"${data.name}" updated successfully.` });
                        } catch (err) {
                          toast({ title: "Save failed", description: "Network error — check connection.", variant: "destructive" });
                        } finally {
                          setRenameApplying(false);
                        }
                      }}
                    >
                      {renameApplying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Switching content */}
          {layerMode === 'layers' ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
                Layers ({layerDefs.length})
              </p>
              {layerDefs.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono px-1">No layers found — try refreshing.</p>
              ) : (
                layerDefs.map(layer => {
                  const on = activeLayers.includes(layer.id);
                  return (
                    <div
                      key={layer.id}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-md border transition-colors ${on ? 'border-transparent' : 'border-border'}`}
                      style={on ? { backgroundColor: '#a8d4d218', borderColor: '#a8d4d255' } : {}}
                    >
                      {/* Toggle button — takes full remaining width */}
                      <button
                        onClick={() => toggleLayer(layer.id)}
                        className="flex-1 flex items-center justify-between min-w-0"
                      >
                        <span className="flex items-start gap-1.5 min-w-0">
                          {layer.icon ? (
                            <img
                              src={layer.icon}
                              alt=""
                              className="w-4 h-4 rounded-full shrink-0 object-cover mt-0.5"
                            />
                          ) : (
                            <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: '#a8d4d2' }} />
                          )}
                          <span className="flex flex-col min-w-0 text-left">
                            <span className="text-sm uppercase tracking-wider text-black dark:text-white truncate">{layer.name}</span>
                            {layer.name2 && (
                              <span className="text-xs text-muted-foreground truncate">{layer.name2}</span>
                            )}
                          </span>
                        </span>
                        <span className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors shrink-0 ml-2 ${on ? '' : 'bg-muted'}`} style={on ? { backgroundColor: '#a8d4d2' } : {}}>
                          <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
              <p className="text-[10px] text-muted-foreground font-mono mt-1">
                {activeLayers.length > 0 && effectiveValues
                  ? `${activeLayers.length} layer${activeLayers.length > 1 ? 's' : ''} active · normalized 0–100`
                  : 'No layers active — terrain zeroed'}
              </p>
            </div>
          ) : (
            selectedSegment ? (
              <div className="p-3 rounded-lg border border-border/40 flex-1 flex flex-col min-h-0" style={detailBgStyle}>
                <Label className="text-sm uppercase tracking-wider text-primary mb-2 block shrink-0">
                  Results — [{selectedSegment.xIndex},{selectedSegment.zIndex}]
                </Label>
                {layerResultsAtBlock.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">— no active layers —</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {layerResultsAtBlock.map((r, i) => (
                      <div key={r.id} className="flex flex-col gap-2 rounded-lg border-[1.5px] border-black dark:border-zinc-300 px-3 py-3">
                        {/* Row header: number · icon · name · name2 · pct */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-mono text-foreground/60 shrink-0">{i + 1}.</span>
                          {r.icon && (
                            <img src={r.icon} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                          )}
                          <span className="flex flex-col min-w-0 flex-1">
                            <span className="text-xl font-semibold text-foreground truncate">{r.name}</span>
                            {r.name2 && (
                              <span className="text-base text-foreground/70 truncate">{r.name2}</span>
                            )}
                          </span>
                          <span className="text-xl font-mono font-bold text-foreground shrink-0">{r.pct}%</span>
                        </div>
                        {/* Percentage bar */}
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${r.pct}%`, backgroundColor: blockBarColor }}
                          />
                        </div>
                        {/* Description — inside the card, below bar */}
                        {r.description && (
                          <p className="text-base text-foreground/80 leading-snug pt-0.5">{r.description}</p>
                        )}
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      total · {layerResultsAtBlock.reduce((s, r) => s + r.value, 0)} · {layerResultsAtBlock.length} layer{layerResultsAtBlock.length > 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-4">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-current flex items-center justify-center">
                  <Info className="w-8 h-8" />
                </div>
                <p className="text-center text-sm px-8">Select a segment in the 3D grid to view its details.</p>
              </div>
            )
          )}
        </div>

      </div>

      {/* Admin-only Project Settings drawer — never rendered in production builds */}
      {isAdmin && (
        <ProjectSettingsDrawer
          open={showProjectSettings}
          onClose={() => setShowProjectSettings(false)}
        />
      )}
    </div>
  );
}