import type { File } from 'expo-file-system';
import { useCallback, useState } from 'react';

import { t } from './i18n';
import { downloadUpdate, installUpdate, type UpdateInfo } from './services/update';

/**
 * Descarregar a versão nova e abrir o instalador.
 *
 * Vive aqui, e não dentro de um dos ecrãs, porque **são dois os sítios que
 * fazem isto**: o aviso que aparece ao abrir a aplicação e a secção das
 * definições. Duas cópias do mesmo código acabariam por divergir — e a parte
 * que divergiria era a que trata dos erros, que é justamente a que ninguém
 * experimenta.
 *
 * Fica ao nível do `src/`, ao lado do `settings.tsx`, que é onde já moram os
 * ganchos usados por mais do que um componente.
 */
export function useUpdateDownload() {
  const [progress, setProgress] = useState<number | null>(null);
  /** O APK já descarregado, à espera de ser instalado. */
  const [ready, setReady] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (info: UpdateInfo) => {
    setProgress(0);
    setError(null);
    try {
      const ficheiro = await downloadUpdate(info, setProgress);
      setReady(ficheiro);
      // Abre-se o instalador logo a seguir: quem carregou em "atualizar" não
      // quer carregar noutro botão a seguir. Se fechar o instalador sem
      // instalar, o botão fica lá para o voltar a abrir.
      await installUpdate(ficheiro);
    } catch (err) {
      setError(err instanceof Error ? err.message : t().common.failed);
    } finally {
      setProgress(null);
    }
  }, []);

  const install = useCallback(async () => {
    if (!ready) {
      return;
    }
    setError(null);
    try {
      await installUpdate(ready);
    } catch (err) {
      setError(err instanceof Error ? err.message : t().common.failed);
    }
  }, [ready]);

  return {
    /** Quanto já vai, de 0 a 1. `null` quando não está a descarregar. */
    progress,
    downloading: progress !== null,
    ready: ready !== null,
    error,
    start,
    install,
  };
}
