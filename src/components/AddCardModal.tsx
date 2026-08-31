import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { LEVELS } from '../data/decks';
import { useUserCards } from '../contexts/UserCardsContext';
import { useLang } from '../contexts/LanguageContext';
import type { NewCardInput, UserCard } from '../lib/api';
import styles from './AddCardModal.module.css';

interface AddCardModalProps {
  /** Optional pre-fill — useful for "duplicate" or "edit" actions. */
  initial?: Partial<NewCardInput>;
  /** When set, the modal edits the card instead of creating a new one. */
  editing?: UserCard;
  onClose: () => void;
}

interface FieldErrors {
  level?: string;
  category?: string;
  kazakh?: string;
  translationRu?: string;
  sourceUrl?: string;
  /** Catch-all server message. */
  _form?: string;
}

const EMPTY: NewCardInput = {
  level: 'A1',
  category: '',
  kazakh: '',
  transliteration: '',
  translation: '',
  translationRu: '',
  example: '',
  source: '',
  sourceUrl: '',
  license: '',
};

/**
 * Modal for creating or editing a user-owned card. The form is
 * uncontrolled enough to feel native (regular `<input>` tags, Enter
 * submits) and validation happens in two layers: client-side for
 * the obvious "required" check, then a second pass on the server
 * whose error we surface as a generic form-level message.
 */
export function AddCardModal({ initial, editing, onClose }: AddCardModalProps) {
  const { create, update } = useUserCards();
  const { t } = useLang();
  // Pre-fill from either `initial` (sparse) or `editing` (a full
  // UserCard). When editing, the form opens with all the
  // existing values already in place; the user just changes
  // what they need and hits Save.
  const [values, setValues] = useState<NewCardInput>(() => {
    if (editing) {
      return {
        level: editing.level,
        category: editing.category ?? '',
        kazakh: editing.kazakh,
        transliteration: editing.transliteration ?? '',
        translation: editing.translation ?? '',
        translationRu: editing.translationRu,
        example: editing.example ?? '',
        source: editing.source ?? '',
        sourceUrl: editing.sourceUrl ?? '',
        license: editing.license ?? '',
        attribution: editing.attribution ?? '',
      };
    }
    return {
      ...EMPTY,
      ...initial,
      level: initial?.level ?? 'A1',
    };
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof NewCardInput>(k: K, v: NewCardInput[K]) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  };

  function validate(): FieldErrors {
    const e: FieldErrors = {};
    if (!values.level) e.level = t('cards.form.error.levelRequired');
    if (!values.category.trim()) e.category = t('cards.form.error.categoryRequired');
    if (!values.kazakh.trim()) e.kazakh = t('cards.form.error.kazakhRequired');
    if (!values.translationRu.trim()) e.translationRu = t('cards.form.error.translationRuRequired');
    if (values.sourceUrl && values.sourceUrl.trim().length > 0) {
      try {
        // eslint-disable-next-line no-new
        new URL(values.sourceUrl.trim());
      } catch {
        e.sourceUrl = t('cards.form.error.badUrl');
      }
    }
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const v = validate();
    if (Object.keys(v).length > 0) {
      setErrors(v);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const payload: NewCardInput = {
        level: values.level,
        category: values.category.trim(),
        kazakh: values.kazakh.trim(),
        translationRu: values.translationRu.trim(),
        ...(values.transliteration?.trim() ? { transliteration: values.transliteration.trim() } : {}),
        ...(values.translation?.trim() ? { translation: values.translation.trim() } : {}),
        ...(values.example?.trim() ? { example: values.example.trim() } : {}),
        ...(values.source?.trim() ? { source: values.source.trim() } : {}),
        ...(values.sourceUrl?.trim() ? { sourceUrl: values.sourceUrl.trim() } : {}),
        ...(values.license?.trim() ? { license: values.license.trim() } : {}),
      };
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload);
      }
      onClose();
    } catch (err) {
      setErrors({
        _form: err instanceof Error ? err.message : t('cards.form.error.generic'),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-card-title"
      >
        <header className={styles.head}>
          <h2 id="add-card-title" className={styles.title}>
            <Plus size={18} />
            {editing ? t('cards.form.editTitle') : t('cards.form.title')}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('cards.form.close')}
          >
            <X size={16} />
          </button>
        </header>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.row}>
            <label className="label" htmlFor="card-level">
              {t('cards.form.level')}
            </label>
            <select
              id="card-level"
              className={`input ${errors.level ? styles.inputError : ''}`}
              value={values.level}
              onChange={(e) => set('level', e.target.value as NewCardInput['level'])}
            >
              {LEVELS.map((l) => (
                <option key={l.id} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>
            {errors.level ? <p className={styles.error}>{errors.level}</p> : null}
          </div>

          <div className={styles.row}>
            <label className="label" htmlFor="card-category">
              {t('cards.form.category')}
            </label>
            <input
              id="card-category"
              className={`input ${errors.category ? styles.inputError : ''}`}
              type="text"
              maxLength={64}
              value={values.category}
              onChange={(e) => set('category', e.target.value)}
              placeholder={t('cards.form.categoryPlaceholder')}
            />
            {errors.category ? <p className={styles.error}>{errors.category}</p> : null}
          </div>

          <div className={styles.row}>
            <label className="label" htmlFor="card-kazakh">
              {t('cards.form.kazakh')}
            </label>
            <input
              id="card-kazakh"
              className={`input ${errors.kazakh ? styles.inputError : ''}`}
              type="text"
              maxLength={200}
              value={values.kazakh}
              onChange={(e) => set('kazakh', e.target.value)}
              placeholder={t('cards.form.kazakhPlaceholder')}
            />
            {errors.kazakh ? <p className={styles.error}>{errors.kazakh}</p> : null}
          </div>

          <div className={styles.row}>
            <label className="label" htmlFor="card-translit">
              {t('cards.form.transliteration')}
            </label>
            <input
              id="card-translit"
              className="input"
              type="text"
              maxLength={200}
              value={values.transliteration ?? ''}
              onChange={(e) => set('transliteration', e.target.value)}
              placeholder={t('cards.form.transliterationPlaceholder')}
            />
          </div>

          <div className={styles.row}>
            <label className="label" htmlFor="card-ru">
              {t('cards.form.translationRu')}
            </label>
            <input
              id="card-ru"
              className={`input ${errors.translationRu ? styles.inputError : ''}`}
              type="text"
              maxLength={400}
              value={values.translationRu}
              onChange={(e) => set('translationRu', e.target.value)}
              placeholder={t('cards.form.translationRuPlaceholder')}
            />
            {errors.translationRu ? <p className={styles.error}>{errors.translationRu}</p> : null}
          </div>

          <div className={styles.row}>
            <label className="label" htmlFor="card-translation">
              {t('cards.form.translation')}
            </label>
            <input
              id="card-translation"
              className="input"
              type="text"
              maxLength={400}
              value={values.translation ?? ''}
              onChange={(e) => set('translation', e.target.value)}
              placeholder={t('cards.form.translationPlaceholder')}
            />
          </div>

          <div className={styles.row}>
            <label className="label" htmlFor="card-example">
              {t('cards.form.example')}
            </label>
            <textarea
              id="card-example"
              className="input"
              rows={2}
              maxLength={600}
              value={values.example ?? ''}
              onChange={(e) => set('example', e.target.value)}
              placeholder={t('cards.form.examplePlaceholder')}
            />
          </div>

          <details className={styles.advanced}>
            <summary>{t('cards.form.advancedToggle')}</summary>
            <div className={styles.advancedGrid}>
              <div className={styles.row}>
                <label className="label" htmlFor="card-source">
                  {t('cards.form.source')}
                </label>
                <input
                  id="card-source"
                  className="input"
                  type="text"
                  maxLength={64}
                  value={values.source ?? ''}
                  onChange={(e) => set('source', e.target.value)}
                  placeholder={t('cards.form.sourcePlaceholder')}
                />
              </div>
              <div className={styles.row}>
                <label className="label" htmlFor="card-source-url">
                  {t('cards.form.sourceUrl')}
                </label>
                <input
                  id="card-source-url"
                  className={`input ${errors.sourceUrl ? styles.inputError : ''}`}
                  type="url"
                  maxLength={512}
                  value={values.sourceUrl ?? ''}
                  onChange={(e) => set('sourceUrl', e.target.value)}
                  placeholder="https://..."
                />
                {errors.sourceUrl ? <p className={styles.error}>{errors.sourceUrl}</p> : null}
              </div>
              <div className={styles.row}>
                <label className="label" htmlFor="card-license">
                  {t('cards.form.license')}
                </label>
                <input
                  id="card-license"
                  className="input"
                  type="text"
                  maxLength={32}
                  value={values.license ?? ''}
                  onChange={(e) => set('license', e.target.value)}
                  placeholder="CC-BY-SA-4.0"
                />
              </div>
            </div>
          </details>

          {errors._form ? <p className={styles.formError}>{errors._form}</p> : null}

          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={busy}
            >
              {t('cards.form.cancel')}
            </button>
            <button type="submit" className="btn btn--lg" disabled={busy}>
              {busy ? '…' : editing ? t('cards.form.save') : t('cards.form.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
