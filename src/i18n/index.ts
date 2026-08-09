import { getLocales } from 'expo-localization';

import { en } from './en';
import { pt } from './pt';

/**
 * As línguas da aplicação.
 *
 * ## Como se escolhe
 *
 * Em "automático" segue a **língua do telemóvel**, e não o país onde a pessoa
 * está. É de propósito: um português em viagem continua a querer a aplicação em
 * português, e é o que "automático" quer dizer em qualquer outra aplicação.
 * Quem quiser outra coisa escolhe à mão nas definições.
 *
 * Qualquer língua que não seja o português cai no inglês. Não é preguiça — é a
 * regra normal: o inglês é a língua de recurso, e acrescentar uma língua nova é
 * só juntar um ficheiro ao lado do `en.ts`.
 *
 * ## Porque é que há duas formas de lhe chegar
 *
 * Os componentes usam o `useT()`, que é um hook e faz o ecrã redesenhar-se
 * quando a língua muda. **Os serviços não podem usar hooks** e continuam a
 * lançar erros com mensagem — para esses há o `t()`, que lê a língua de uma
 * variável do módulo. É a mesma tabela, por dois caminhos.
 *
 * ## Ao acrescentar texto novo
 *
 * Junta-se a chave ao `pt.ts` **e** ao `en.ts`. O `en.ts` está tipado contra o
 * `pt.ts`, por isso esquecer-se de um lado é um erro de compilação e não uma
 * palavra em português a aparecer no meio do inglês. É a única verificação
 * automática que este projeto tem — vale a pena que apanhe isto.
 */

export type Language = 'pt' | 'en';

/** O que se guarda nas definições: uma língua, ou seguir o telemóvel. */
export type LanguagePreference = 'auto' | Language;

export type Strings = typeof pt;

const TABELAS: Record<Language, Strings> = { pt, en };

/** A língua do telemóvel, se for uma das que a aplicação fala. */
export function deviceLanguage(): Language {
  try {
    // `getLocales()` vem por ordem de preferência. A primeira que se saiba falar
    // ganha: um telemóvel em francês com português em segundo fica em português.
    for (const locale of getLocales()) {
      const codigo = locale.languageCode?.toLowerCase();
      if (codigo === 'pt' || codigo === 'en') {
        return codigo;
      }
    }
  } catch {
    // Sem informação do sistema, o inglês é o menos mau para toda a gente.
  }
  return 'en';
}

/** A língua a usar, já a contar com a preferência guardada. */
export function resolveLanguage(preference: LanguagePreference): Language {
  return preference === 'auto' ? deviceLanguage() : preference;
}

/**
 * A língua com que os serviços falam.
 *
 * Fica numa variável do módulo porque os serviços não têm acesso ao contexto do
 * React. Quem a põe é o `SettingsProvider`, sempre que a preferência muda.
 */
let ativa: Language = 'pt';

export function setActiveLanguage(language: Language): void {
  ativa = language;
}

export function activeLanguage(): Language {
  return ativa;
}

/** Os textos, para quem não pode usar hooks. */
export function t(): Strings {
  return TABELAS[ativa];
}

/** Os textos de uma língua concreta. */
export function stringsFor(language: Language): Strings {
  return TABELAS[language];
}

/**
 * A etiqueta de língua para a voz da navegação.
 *
 * O `expo-speech` escolhe a voz por aqui. Sem isto, as instruções em inglês
 * saíam lidas com pronúncia portuguesa — percebe-se, mas soa mal e, a conduzir,
 * o que importa é perceber-se à primeira.
 */
export function speechTag(language: Language): string {
  return language === 'pt' ? 'pt-PT' : 'en-GB';
}

/**
 * A língua a pedir ao Nominatim, no `accept-language`.
 *
 * Faz a pesquisa devolver os nomes na língua da aplicação onde o
 * OpenStreetMap os tiver traduzidos — "Lisbon" em vez de "Lisboa" para quem
 * está em inglês.
 */
export function acceptLanguage(language: Language): string {
  return language === 'pt' ? 'pt-PT,pt' : 'en';
}
