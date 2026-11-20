#!/usr/bin/env python3
"""English names for the catalogues' Portuguese ones.

The published manifests (`mapas.json`, `horarios.json`) carry `nome` in
Portuguese, the catalogues' language. The app shows them in English through
`src/i18n/catalogueNames.ts`, which this script writes from `map-regions.json`
and `transit-feeds.json` — run it again after adding entries to either
(`python3 scripts/catalogue-names.py`). A name with no translation here stays
as it is (operator names mostly do) and is listed on the way out.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ISO code → (Portuguese, English). Map entries carry `pais` as the Portuguese
# name (timetables carry the code, named by `schedules.countries` in the app).
COUNTRIES = {
    "PT": ("Portugal", "Portugal"), "ES": ("Espanha", "Spain"), "FR": ("França", "France"),
    "IT": ("Itália", "Italy"), "DE": ("Alemanha", "Germany"), "GB": ("Reino Unido", "United Kingdom"),
    "IE": ("Irlanda", "Ireland"), "NL": ("Países Baixos", "Netherlands"), "BE": ("Bélgica", "Belgium"),
    "LU": ("Luxemburgo", "Luxembourg"), "CH": ("Suíça", "Switzerland"), "AT": ("Áustria", "Austria"),
    "PL": ("Polónia", "Poland"), "CZ": ("Chéquia", "Czechia"), "SK": ("Eslováquia", "Slovakia"),
    "HU": ("Hungria", "Hungary"), "DK": ("Dinamarca", "Denmark"), "SE": ("Suécia", "Sweden"),
    "NO": ("Noruega", "Norway"), "FI": ("Finlândia", "Finland"), "EE": ("Estónia", "Estonia"),
    "LV": ("Letónia", "Latvia"), "LT": ("Lituânia", "Lithuania"), "HR": ("Croácia", "Croatia"),
    "SI": ("Eslovénia", "Slovenia"), "RO": ("Roménia", "Romania"), "BG": ("Bulgária", "Bulgaria"),
    "GR": ("Grécia", "Greece"), "CY": ("Chipre", "Cyprus"), "MT": ("Malta", "Malta"),
    "BR": ("Brasil", "Brazil"),
}

NAMES = {
    # Countries and regions without zones.
    "São Tomé e Príncipe": "São Tomé and Príncipe", "Cabo Verde": "Cape Verde",
    "Guiné-Bissau": "Guinea-Bissau", "Moçambique": "Mozambique", "Irlanda": "Ireland",
    "Bélgica": "Belgium", "Luxemburgo": "Luxembourg", "Suíça": "Switzerland", "Áustria": "Austria",
    "Eslováquia": "Slovakia", "Hungria": "Hungary", "Dinamarca": "Denmark", "Noruega": "Norway",
    "Suécia": "Sweden", "Finlândia": "Finland", "Grécia": "Greece", "Croácia": "Croatia",
    "Eslovénia": "Slovenia", "Roménia": "Romania", "Bulgária": "Bulgaria", "Sérvia": "Serbia",
    "Bósnia e Herzegovina": "Bosnia and Herzegovina", "Albânia": "Albania",
    "Macedónia do Norte": "North Macedonia", "Estónia": "Estonia", "Letónia": "Latvia",
    "Lituânia": "Lithuania", "Islândia": "Iceland", "Chipre": "Cyprus", "Ucrânia": "Ukraine",
    "Marrocos": "Morocco", "Tunísia": "Tunisia", "Argélia": "Algeria", "Egito": "Egypt",
    "Gana": "Ghana", "Nigéria": "Nigeria", "Gabão": "Gabon", "Quénia": "Kenya",
    "Tanzânia": "Tanzania", "Namíbia": "Namibia", "África do Sul": "South Africa",
    "Estados Unidos (oeste)": "United States (west)", "Estados Unidos (centro)": "United States (central)",
    "Estados Unidos (este)": "United States (east)", "Canadá": "Canada", "México": "Mexico",
    "Colômbia": "Colombia", "Bolívia": "Bolivia", "Uruguai": "Uruguay", "Equador": "Ecuador",
    "Turquia": "Turkey", "Emirados Árabes Unidos": "United Arab Emirates", "Catar": "Qatar",
    "Arábia Saudita": "Saudi Arabia", "Índia": "India", "Japão": "Japan",
    "Coreia do Sul": "South Korea", "Tailândia": "Thailand", "Vietname": "Vietnam",
    "Malásia": "Malaysia", "Singapura": "Singapore", "Filipinas": "Philippines",
    "Indonésia": "Indonesia", "Austrália": "Australia", "Nova Zelândia": "New Zealand",
    "Portugal continental": "Mainland Portugal",
    # Countries with zones.
    "Brasil": "Brazil", "Espanha": "Spain", "França": "France", "Itália": "Italy",
    "Alemanha": "Germany", "Reino Unido": "United Kingdom", "Países Baixos": "Netherlands",
    "Polónia": "Poland", "Chéquia": "Czechia",
    # Zones.
    "Açores": "Azores", "Norte": "North", "Centro": "Centre", "Sul": "South",
    "Lisboa e Vale do Tejo": "Lisbon and Tagus Valley",
    "Centro-Oeste": "Centre-West", "Nordeste": "Northeast", "Sudeste": "Southeast", "Noroeste": "Northwest",
    "Andaluzia": "Andalusia", "Aragão": "Aragon", "Astúrias": "Asturias", "Baleares": "Balearic Islands",
    "Cantábria": "Cantabria", "Castela e Leão": "Castile and León", "Castela-Mancha": "Castilla-La Mancha",
    "Catalunha": "Catalonia", "Estremadura": "Extremadura", "Galiza": "Galicia", "Múrcia": "Murcia",
    "País Basco": "Basque Country", "Valência": "Valencia",
    "Alsácia": "Alsace", "Alta Normandia": "Upper Normandy", "Aquitânia": "Aquitaine",
    "Auvérnia": "Auvergne", "Baixa Normandia": "Lower Normandy", "Borgonha": "Burgundy",
    "Bretanha": "Brittany", "Centro-Vale do Loire": "Centre-Val de Loire",
    "Champanhe-Ardenas": "Champagne-Ardenne", "Córsega": "Corsica", "Franco-Condado": "Franche-Comté",
    "Languedoc-Rossilhão": "Languedoc-Roussillon", "Limusino": "Limousin", "Lorena": "Lorraine",
    "Midi-Pirenéus": "Midi-Pyrénées", "Países do Loire": "Pays de la Loire", "Picardia": "Picardy",
    "Provença-Alpes-Costa Azul": "Provence-Alpes-Côte d'Azur", "Ródano-Alpes": "Rhône-Alpes",
    "Sicília e Sardenha": "Sicily and Sardinia",
    "Bade-Vurtemberga": "Baden-Württemberg", "Baixa Saxónia (com Bremen)": "Lower Saxony (with Bremen)",
    "Baviera": "Bavaria", "Berlim": "Berlin", "Brandeburgo (com Berlim)": "Brandenburg (with Berlin)",
    "Hamburgo": "Hamburg", "Meclemburgo-Pomerânia Ocidental": "Mecklenburg-Western Pomerania",
    "Renânia do Norte-Vestefália": "North Rhine-Westphalia", "Renânia-Palatinado": "Rhineland-Palatinate",
    "Sarre": "Saarland", "Saxónia": "Saxony", "Saxónia-Anhalt": "Saxony-Anhalt", "Turíngia": "Thuringia",
    "Escócia": "Scotland", "Inglaterra": "England", "País de Gales": "Wales",
    "Brabante do Norte": "North Brabant", "Flevolândia": "Flevoland", "Frísia": "Friesland",
    "Groninga": "Groningen", "Guéldria": "Gelderland", "Holanda do Norte": "North Holland",
    "Holanda do Sul": "South Holland", "Overissel": "Overijssel", "Zelândia": "Zeeland",
    "Baixa Silésia": "Lower Silesia", "Cujávia-Pomerânia": "Kuyavian-Pomeranian",
    "Grande Polónia": "Greater Poland", "Lubúsquia": "Lubusz", "Mazóvia": "Masovia",
    "Pequena Polónia": "Lesser Poland", "Podláquia": "Podlaskie", "Pomerânia": "Pomerania",
    "Pomerânia Ocidental": "West Pomerania", "Santa Cruz": "Holy Cross", "Silésia": "Silesia",
    "Subcarpácia": "Subcarpathia", "Vármia-Masúria": "Warmia-Masuria",
    "Boémia Central (com Praga)": "Central Bohemia (with Prague)", "Boémia do Sul": "South Bohemia",
    "Morávia do Sul": "South Moravia", "Morávia-Silésia": "Moravia-Silesia", "Praga": "Prague",
    # Timetables.
    "CP — Comboios de Portugal": "CP — Portuguese Railways",
    "Wiener Linien e Wiener Lokalbahnen": "Wiener Linien and Wiener Lokalbahnen",
    "SNCB — comboios da Bélgica": "SNCB — Belgian trains", "TEC — Valónia": "TEC — Wallonia",
    "Sofia — transportes urbanos": "Sofia — city transport",
    "Plovdiv — transportes urbanos": "Plovdiv — city transport",
    "Varna — transportes urbanos": "Varna — city transport",
    "Chipre — interurbanos": "Cyprus — intercity buses",
    "Praga (PID)": "Prague (PID)", "Morávia do Sul (IDS JMK)": "South Moravia (IDS JMK)",
    "Berlim e Brandeburgo (VBB)": "Berlin and Brandenburg (VBB)", "Hamburgo (HVV)": "Hamburg (HVV)",
    "Munique (MVG)": "Munich (MVG)", "Nuremberga (VGN)": "Nuremberg (VGN)",
    "Colónia e Bona (VRS)": "Cologne and Bonn (VRS)",
    "Mannheim e Heidelberga (RNV)": "Mannheim and Heidelberg (RNV)",
    "Turíngia central (VMT)": "Central Thuringia (VMT)", "Friburgo (VAG)": "Freiburg (VAG)",
    "Alemanha — comboios regionais": "Germany — regional trains",
    "Alemanha — longo curso": "Germany — long-distance trains",
    "Dinamarca (Rejseplanen)": "Denmark (Rejseplanen)",
    "Tallinn — transportes urbanos": "Tallinn — city transport",
    "Tartu — transportes urbanos": "Tartu — city transport",
    "Elron — comboios da Estónia": "Elron — Estonian trains",
    "Madrid — interurbanos (CRTM)": "Madrid — intercity buses (CRTM)",
    "Madrid — metro ligeiro (CRTM)": "Madrid — light rail (CRTM)",
    "Catalunha — interurbanos": "Catalonia — intercity buses",
    "Renfe — longo curso": "Renfe — long-distance", "Vitória (TUVISA)": "Vitoria (TUVISA)",
    "EMT Valência": "EMT Valencia", "Maiorca (TIB)": "Mallorca (TIB)",
    "Helsínquia (HSL)": "Helsinki (HSL)", "Bordéus (TBM)": "Bordeaux (TBM)",
    "Aix-Marselha (Métropole)": "Aix-Marseille (Métropole)", "Ulysse (Provença)": "Ulysse (Provence)",
    "Occitânia — interurbanos (liO)": "Occitania — intercity buses (liO)",
    "Países do Loire — interurbanos (Aléop)": "Pays de la Loire — intercity buses (Aléop)",
    "HŽPP — comboios da Croácia": "HŽPP — Croatian trains", "Budapeste (BKK)": "Budapest (BKK)",
    "Roma (ATAC e outros)": "Rome (ATAC and others)", "Lácio (Cotral)": "Lazio (Cotral)",
    "Turim (GTT)": "Turin (GTT)", "Veneza — autocarros (ACTV)": "Venice — buses (ACTV)",
    "Veneza — vaporetti (ACTV)": "Venice — vaporetti (ACTV)", "Nápoles (ANM)": "Naples (ANM)",
    "Tirol do Sul (STA)": "South Tyrol (STA)", "Friul-Veneza Júlia (TPL FVG)": "Friuli-Venezia Giulia (TPL FVG)",
    "Romanha (START)": "Romagna (START)", "Pádua (Busitalia Veneto)": "Padua (Busitalia Veneto)",
    "Módena (SETA)": "Modena (SETA)", "Sardenha (ARST)": "Sardinia (ARST)",
    "Florença (Autolinee Toscane)": "Florence (Autolinee Toscane)",
    "LTG Link — comboios da Lituânia": "LTG Link — Lithuanian trains",
    "Pasažieru Vilciens — comboios da Letónia": "Pasažieru Vilciens — Latvian trains",
    "Países Baixos — Randstad": "Netherlands — Randstad",
    "Países Baixos — Norte e Leste": "Netherlands — North and East",
    "Países Baixos — Sul": "Netherlands — South", "Países Baixos — Guéldria": "Netherlands — Gelderland",
    "Varsóvia (ZTM)": "Warsaw (ZTM)", "Cracóvia (ZTP)": "Kraków (ZTP)", "SKM Tricidade": "SKM Tricity",
    "Polónia — comboios": "Poland — trains", "WKD (Varsóvia)": "WKD (Warsaw)",
    "Transportes Colectivos do Barreiro": "Transportes Colectivos do Barreiro",
    "Horários do Funchal": "Horários do Funchal",
    "Bucareste (STB e Metrorex)": "Bucharest (STB and Metrorex)",
    "Roménia — comboios": "Romania — trains", "Liubliana (LPP)": "Ljubljana (LPP)",
    "Bratislava — regionais (IDS BK)": "Bratislava — regional (IDS BK)",
    "ZSSK — comboios da Eslováquia": "ZSSK — Slovak trains",
    "Limburgo": "Limburg", "Trenord (Lombardia)": "Trenord (Lombardy)",
    "Carris (Lisboa)": "Carris (Lisbon)",
}


def main() -> None:
    regions = json.loads((ROOT / "map-regions.json").read_text())
    regions = regions["regioes"] if isinstance(regions, dict) else regions
    feeds = json.loads((ROOT / "transit-feeds.json").read_text())["feeds"]
    maps, timetables, missing = {}, {}, set()
    for entries, out in ((regions, maps), (feeds, timetables)):
        for e in entries:
            en = NAMES.get(e["nome"])
            if en is None:
                missing.add(e["nome"])
            elif en != e["nome"]:
                out[e["id"]] = en
    # The map entries' `pais` is a Portuguese country name; the app needs its English too.
    by_pt = {pt: en for pt, en in COUNTRIES.values()}
    lines = [
        "// Generated by scripts/catalogue-names.py from map-regions.json and",
        "// transit-feeds.json — do not edit by hand; run the script again.",
        "",
        "/** English names of the country maps and zones, by id. */",
        f"export const MAP_NAMES_EN: Record<string, string> = {json.dumps(maps, ensure_ascii=False, indent=2, sort_keys=True)};",
        "",
        "/** English names of the timetables, by id. */",
        f"export const TIMETABLE_NAMES_EN: Record<string, string> = {json.dumps(timetables, ensure_ascii=False, indent=2, sort_keys=True)};",
        "",
        "/** A map entry's Portuguese country name → its English. */",
        f"export const COUNTRY_EN_BY_PT: Record<string, string> = {json.dumps(by_pt, ensure_ascii=False, indent=2, sort_keys=True)};",
        "",
    ]
    (ROOT / "src/i18n/catalogueNames.ts").write_text("\n".join(lines))
    print(f"{len(maps)} map names, {len(timetables)} timetable names")
    if missing:
        print("Left as they are (same in English):", " | ".join(sorted(missing)))


if __name__ == "__main__":
    main()
