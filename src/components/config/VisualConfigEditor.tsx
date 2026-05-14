import {
  useLayoutEffect,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconCode,
  IconDiamond,
  IconKey,
  IconSatellite,
  IconSettings,
  IconShield,
  IconTimer,
  IconTrendingUp,
  type IconProps,
} from '@/components/ui/icons';
import { ConfigSection } from '@/components/config/ConfigSection';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type {
  CodexCustomModelValidationErrors,
  PayloadFilterRule,
  PayloadParamValidationErrorCode,
  PayloadRule,
  VisualConfigFieldPath,
  VisualConfigValidationErrorCode,
  VisualConfigValidationErrors,
  VisualConfigValues,
} from '@/types/visualConfig';
import {
  ApiKeysCardEditor,
  CodexCustomModelsEditor,
  PayloadFilterRulesEditor,
  PayloadRulesEditor,
} from './VisualConfigEditorBlocks';
import styles from './VisualConfigEditor.module.scss';

type VisualSectionId =
  | 'server'
  | 'tls'
  | 'remote'
  | 'auth'
  | 'system'
  | 'network'
  | 'images'
  | 'quota'
  | 'maintenance'
  | 'streaming'
  | 'payload';

type VisualSection = {
  id: VisualSectionId;
  title: string;
  description: string;
  icon: ComponentType<IconProps>;
  errorCount: number;
};

interface VisualConfigEditorProps {
  values: VisualConfigValues;
  validationErrors?: VisualConfigValidationErrors;
  codexCustomModelValidationErrors?: CodexCustomModelValidationErrors;
  hasPayloadValidationErrors?: boolean;
  disabled?: boolean;
  onChange: (values: Partial<VisualConfigValues>) => void;
}

function getValidationMessage(
  t: ReturnType<typeof useTranslation>['t'],
  errorCode?: VisualConfigValidationErrorCode | PayloadParamValidationErrorCode
) {
  if (!errorCode) return undefined;
  return t(`config_management.visual.validation.${errorCode}`);
}

type ToggleRowProps = {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
};

function ToggleRow({ title, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleCopy}>
        <div className={styles.toggleTitle}>{title}</div>
        {description ? <div className={styles.toggleDescription}>{description}</div> : null}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} ariaLabel={title} />
    </div>
  );
}

function SectionGrid({ children }: { children: ReactNode }) {
  return <div className={styles.sectionGrid}>{children}</div>;
}

function SectionStack({ children }: { children: ReactNode }) {
  return <div className={styles.sectionStack}>{children}</div>;
}

function Divider() {
  return <div className={styles.divider} />;
}

function SectionSubsection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.subsection}>
      <div className={styles.subsectionHeader}>
        <h3 className={styles.subsectionTitle}>{title}</h3>
        {description ? <p className={styles.subsectionDescription}>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function FieldShell({
  label,
  labelId,
  htmlFor,
  hint,
  hintId,
  error,
  errorId,
  children,
}: {
  label: string;
  labelId?: string;
  htmlFor?: string;
  hint?: string;
  hintId?: string;
  error?: string;
  errorId?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.fieldShell}>
      <label id={labelId} htmlFor={htmlFor} className={styles.fieldLabel}>
        {label}
      </label>
      {children}
      {error ? (
        <div id={errorId} className="error-box">
          {error}
        </div>
      ) : null}
      {hint ? (
        <div id={hintId} className={styles.fieldHint}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function VisualConfigEditor({
  values,
  validationErrors,
  codexCustomModelValidationErrors,
  hasPayloadValidationErrors = false,
  disabled = false,
  onChange,
}: VisualConfigEditorProps) {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.isCurrentLayer : true;
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isFloatingSidebar = useMediaQuery('(min-width: 1025px)');
  const shouldRenderFloatingSidebar = !isMobile && isFloatingSidebar && isCurrentLayer;
  const routingStrategyLabelId = useId();
  const routingStrategyHintId = `${routingStrategyLabelId}-hint`;
  const maintenanceDeleteStatusCodesInputId = useId();
  const maintenanceDeleteStatusCodesHintId = `${maintenanceDeleteStatusCodesInputId}-hint`;
  const maintenanceDeleteStatusCodesErrorId = `${maintenanceDeleteStatusCodesInputId}-error`;
  const noCooldownStatusCodesInputId = useId();
  const noCooldownStatusCodesHintId = `${noCooldownStatusCodesInputId}-hint`;
  const noCooldownStatusCodesErrorId = `${noCooldownStatusCodesInputId}-error`;
  const keepaliveInputId = useId();
  const keepaliveHintId = `${keepaliveInputId}-hint`;
  const keepaliveErrorId = `${keepaliveInputId}-error`;
  const nonstreamKeepaliveInputId = useId();
  const nonstreamKeepaliveHintId = `${nonstreamKeepaliveInputId}-hint`;
  const nonstreamKeepaliveErrorId = `${nonstreamKeepaliveInputId}-error`;
  const [activeSectionId, setActiveSectionId] = useState<VisualSectionId>('server');
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const sidebarAnchorRef = useRef<HTMLElement | null>(null);
  const floatingSidebarRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Partial<Record<VisualSectionId, HTMLElement | null>>>({});
  const mobileNavScrollerRef = useRef<HTMLDivElement | null>(null);
  const mobileNavButtonRefs = useRef<Partial<Record<VisualSectionId, HTMLButtonElement | null>>>(
    {}
  );

  const isKeepaliveDisabled =
    values.streaming.keepaliveSeconds === '' || values.streaming.keepaliveSeconds === '0';
  const isNonstreamKeepaliveDisabled =
    values.streaming.nonstreamKeepaliveInterval === '' ||
    values.streaming.nonstreamKeepaliveInterval === '0';

  const portError = getValidationMessage(t, validationErrors?.port);
  const rmAccessPathError = getValidationMessage(t, validationErrors?.rmAccessPath);
  const logsMaxSizeError = getValidationMessage(t, validationErrors?.logsMaxTotalSizeMb);
  const usageStatisticsPersistIntervalError = getValidationMessage(
    t,
    validationErrors?.usageStatisticsPersistIntervalSeconds
  );
  const requestRetryError = getValidationMessage(t, validationErrors?.requestRetry);
  const maxRetryCredentialsError = getValidationMessage(t, validationErrors?.maxRetryCredentials);
  const maxRetryIntervalError = getValidationMessage(t, validationErrors?.maxRetryInterval);
  const noCooldownStatusCodesError = getValidationMessage(
    t,
    validationErrors?.noCooldownStatusCodes
  );
  const imagesUnsupportedStatusCodeError = getValidationMessage(
    t,
    validationErrors?.['images.unsupportedStatusCode']
  );
  const authMaintenanceScanIntervalError = getValidationMessage(
    t,
    validationErrors?.['authMaintenance.scanIntervalSeconds']
  );
  const authMaintenanceDeleteIntervalError = getValidationMessage(
    t,
    validationErrors?.['authMaintenance.deleteIntervalSeconds']
  );
  const authMaintenanceDeleteStatusCodesError = getValidationMessage(
    t,
    validationErrors?.['authMaintenance.deleteStatusCodes']
  );
  const authMaintenanceQuotaStrikeThresholdError = getValidationMessage(
    t,
    validationErrors?.['authMaintenance.quotaStrikeThreshold']
  );
  const authMaintenanceDisableQuotaStrikeThresholdError = getValidationMessage(
    t,
    validationErrors?.['authMaintenance.disableQuotaStrikeThreshold']
  );
  const keepaliveError = getValidationMessage(t, validationErrors?.['streaming.keepaliveSeconds']);
  const bootstrapRetriesError = getValidationMessage(
    t,
    validationErrors?.['streaming.bootstrapRetries']
  );
  const nonstreamKeepaliveError = getValidationMessage(
    t,
    validationErrors?.['streaming.nonstreamKeepaliveInterval']
  );

  const handleApiKeysTextChange = useCallback(
    (apiKeysText: string) => onChange({ apiKeysText }),
    [onChange]
  );
  const handleCodexCustomModelsChange = useCallback(
    (codexCustomModels: VisualConfigValues['codexCustomModels']) => onChange({ codexCustomModels }),
    [onChange]
  );
  const handlePayloadDefaultRulesChange = useCallback(
    (payloadDefaultRules: PayloadRule[]) => onChange({ payloadDefaultRules }),
    [onChange]
  );
  const handlePayloadDefaultRawRulesChange = useCallback(
    (payloadDefaultRawRules: PayloadRule[]) => onChange({ payloadDefaultRawRules }),
    [onChange]
  );
  const handlePayloadOverrideRulesChange = useCallback(
    (payloadOverrideRules: PayloadRule[]) => onChange({ payloadOverrideRules }),
    [onChange]
  );
  const handlePayloadOverrideRawRulesChange = useCallback(
    (payloadOverrideRawRules: PayloadRule[]) => onChange({ payloadOverrideRawRules }),
    [onChange]
  );
  const handlePayloadFilterRulesChange = useCallback(
    (payloadFilterRules: PayloadFilterRule[]) => onChange({ payloadFilterRules }),
    [onChange]
  );

  const countErrors = useCallback(
    (fields: VisualConfigFieldPath[]) =>
      fields.reduce((total, field) => total + (validationErrors?.[field] ? 1 : 0), 0),
    [validationErrors]
  );
  const authSectionErrorCount = useMemo(
    () =>
      Object.values(codexCustomModelValidationErrors ?? {}).reduce(
        (total, entry) => total + (entry.id ? 1 : 0) + (entry.groups ? 1 : 0),
        0
      ),
    [codexCustomModelValidationErrors]
  );

  const sections = useMemo<VisualSection[]>(
    () => [
      {
        id: 'server',
        title: t('config_management.visual.sections.server.title'),
        description: t('config_management.visual.sections.server.description'),
        icon: IconSettings,
        errorCount: countErrors(['port']),
      },
      {
        id: 'tls',
        title: t('config_management.visual.sections.tls.title'),
        description: t('config_management.visual.sections.tls.description'),
        icon: IconShield,
        errorCount: 0,
      },
      {
        id: 'remote',
        title: t('config_management.visual.sections.remote.title'),
        description: t('config_management.visual.sections.remote.description'),
        icon: IconSatellite,
        errorCount: countErrors(['rmAccessPath']),
      },
      {
        id: 'auth',
        title: t('config_management.visual.sections.auth.title'),
        description: t('config_management.visual.sections.auth.description'),
        icon: IconKey,
        errorCount: authSectionErrorCount,
      },
      {
        id: 'system',
        title: t('config_management.visual.sections.system.title'),
        description: t('config_management.visual.sections.system.description'),
        icon: IconDiamond,
        errorCount: countErrors(['logsMaxTotalSizeMb', 'usageStatisticsPersistIntervalSeconds']),
      },
      {
        id: 'network',
        title: t('config_management.visual.sections.network.title'),
        description: t('config_management.visual.sections.network.description'),
        icon: IconTrendingUp,
        errorCount: countErrors(['requestRetry', 'maxRetryCredentials', 'maxRetryInterval']),
      },
      {
        id: 'images',
        title: t('config_management.visual.sections.images.title'),
        description: t('config_management.visual.sections.images.description'),
        icon: IconDiamond,
        errorCount: countErrors(['images.unsupportedStatusCode']),
      },
      {
        id: 'quota',
        title: t('config_management.visual.sections.quota.title'),
        description: t('config_management.visual.sections.quota.description'),
        icon: IconTimer,
        errorCount: countErrors(['noCooldownStatusCodes']),
      },
      {
        id: 'maintenance',
        title: t('config_management.visual.sections.maintenance.title'),
        description: t('config_management.visual.sections.maintenance.description'),
        icon: IconShield,
        errorCount: countErrors([
          'authMaintenance.scanIntervalSeconds',
          'authMaintenance.deleteIntervalSeconds',
          'authMaintenance.deleteStatusCodes',
          'authMaintenance.quotaStrikeThreshold',
          'authMaintenance.disableQuotaStrikeThreshold',
        ]),
      },
      {
        id: 'streaming',
        title: t('config_management.visual.sections.streaming.title'),
        description: t('config_management.visual.sections.streaming.description'),
        icon: IconSatellite,
        errorCount: countErrors([
          'streaming.keepaliveSeconds',
          'streaming.bootstrapRetries',
          'streaming.nonstreamKeepaliveInterval',
        ]),
      },
      {
        id: 'payload',
        title: t('config_management.visual.sections.payload.title'),
        description: t('config_management.visual.sections.payload.description'),
        icon: IconCode,
        errorCount: hasPayloadValidationErrors ? 1 : 0,
      },
    ],
    [authSectionErrorCount, countErrors, hasPayloadValidationErrors, t]
  );

  const hasValidationIssues =
    sections.some((section) => section.errorCount > 0) || hasPayloadValidationErrors;
  const focusSections = useMemo(
    () =>
      sections.filter((section) =>
        ['server', 'network', 'images', 'maintenance', 'payload'].includes(section.id)
      ),
    [sections]
  );

  useEffect(() => {
    if (!isCurrentLayer) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        if (visibleEntries.length === 0) return;
        setActiveSectionId(visibleEntries[0].target.id as VisualSectionId);
      },
      {
        rootMargin: '-18% 0px -58% 0px',
        threshold: [0.12, 0.3, 0.55],
      }
    );

    for (const section of sections) {
      const element = sectionRefs.current[section.id];
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [isCurrentLayer, sections]);

  useEffect(() => {
    if (!isCurrentLayer || !isMobile) return;
    const scroller = mobileNavScrollerRef.current;
    const button = mobileNavButtonRefs.current[activeSectionId];
    if (!scroller || !button) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const centeredLeft =
      scroller.scrollLeft +
      (buttonRect.left - scrollerRect.left) -
      (scroller.clientWidth - buttonRect.width) / 2;
    const maxScrollLeft = Math.max(scroller.scrollWidth - scroller.clientWidth, 0);
    const targetLeft = Math.min(Math.max(centeredLeft, 0), maxScrollLeft);

    scroller.scrollTo({
      left: targetLeft,
      behavior: 'smooth',
    });
  }, [activeSectionId, isCurrentLayer, isMobile]);

  const handleSectionJump = useCallback((sectionId: VisualSectionId) => {
    setActiveSectionId(sectionId);
    sectionRefs.current[sectionId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useLayoutEffect(() => {
    const floatingElement = floatingSidebarRef.current;
    const anchorElement = sidebarAnchorRef.current;
    const workspaceElement = workspaceRef.current;
    if (!floatingElement) return undefined;

    const clearFloatingStyles = () => {
      floatingElement.style.removeProperty('transform');
      floatingElement.style.removeProperty('width');
      floatingElement.style.removeProperty('max-height');
      floatingElement.style.removeProperty('opacity');
      floatingElement.style.removeProperty('pointer-events');
    };

    if (!shouldRenderFloatingSidebar || !anchorElement || !workspaceElement) {
      clearFloatingStyles();
      return undefined;
    }

    /* ---- Cache header height – recomputed only on resize ---- */
    const computeHeaderHeight = () => {
      const header = document.querySelector('.main-header') as HTMLElement | null;
      if (header) return header.getBoundingClientRect().height;

      const raw = getComputedStyle(document.documentElement).getPropertyValue('--header-height');
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : 64;
    };
    let headerHeight = computeHeaderHeight();

    /* ---- Cache content scroller – resolved once ---- */
    const contentScroller = document.querySelector('.content') as HTMLElement | null;

    /* ---- Cache floating height from previous frame ---- */
    let cachedFloatingHeight = floatingElement.getBoundingClientRect().height || 200;

    let frameId = 0;

    const updateFloatingPosition = () => {
      frameId = 0;

      const anchorRect = anchorElement.getBoundingClientRect();
      const workspaceRect = workspaceElement.getBoundingClientRect();
      const stickyTop = headerHeight + 20;
      const viewportPadding = 16;
      const maxTop = workspaceRect.bottom - cachedFloatingHeight;
      const unclampedTop = Math.min(Math.max(anchorRect.top, stickyTop), maxTop);
      const top = Math.max(unclampedTop, viewportPadding);
      const left = Math.max(anchorRect.left, viewportPadding);
      const width = Math.max(
        Math.min(anchorRect.width, window.innerWidth - left - viewportPadding),
        220
      );
      const maxHeight = Math.max(window.innerHeight - top - viewportPadding, 160);
      const isVisible =
        workspaceRect.bottom > stickyTop + 24 && anchorRect.top < window.innerHeight;

      floatingElement.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      floatingElement.style.width = `${width}px`;
      floatingElement.style.maxHeight = `${maxHeight}px`;
      floatingElement.style.opacity = isVisible ? '1' : '0';
      floatingElement.style.pointerEvents = isVisible ? 'auto' : 'none';
    };

    const requestPositionUpdate = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateFloatingPosition);
    };

    const handleResize = () => {
      headerHeight = computeHeaderHeight();
      cachedFloatingHeight = floatingElement.getBoundingClientRect().height || cachedFloatingHeight;
      requestPositionUpdate();
    };

    requestPositionUpdate();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', requestPositionUpdate, { passive: true });
    contentScroller?.addEventListener('scroll', requestPositionUpdate, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(requestPositionUpdate);
    resizeObserver?.observe(anchorElement);
    resizeObserver?.observe(workspaceElement);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', requestPositionUpdate);
      contentScroller?.removeEventListener('scroll', requestPositionUpdate);
      clearFloatingStyles();
    };
  }, [shouldRenderFloatingSidebar]);

  const navContent = (
    <div className={styles.navList}>
      {sections.map((section, index) => {
        const Icon = section.icon;

        return (
          <button
            key={section.id}
            type="button"
            className={`${styles.navButton} ${
              activeSectionId === section.id ? styles.navButtonActive : ''
            }`}
            onClick={() => handleSectionJump(section.id)}
          >
            <span className={styles.navIndex}>{String(index + 1).padStart(2, '0')}</span>
            <span className={styles.navMain}>
              <span className={styles.navHeadingRow}>
                <span className={styles.navLabelWrap}>
                  <span className={styles.navIcon}>
                    <Icon size={14} />
                  </span>
                  <span className={styles.navLabel}>{section.title}</span>
                </span>
                {section.errorCount > 0 ? (
                  <span className={styles.navBadge} aria-hidden="true">
                    {section.errorCount}
                  </span>
                ) : null}
              </span>
              <span className={styles.navDescription}>{section.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={styles.visualEditor}>
      <div className={styles.overview}>
        <div className={styles.overviewHeader}>
          <div className={styles.overviewMeta}>
            <span className={styles.overviewPill}>
              {t('config_management.visual.quick_jump', { defaultValue: '快速跳转' })}
            </span>
            {hasValidationIssues ? (
              <span className={`${styles.overviewPill} ${styles.overviewPillWarning}`}>
                {t('config_management.visual.validation.validation_blocked')}
              </span>
            ) : null}
          </div>
        </div>

        <div className={styles.overviewFocusList}>
          {focusSections.map((section) => {
            const Icon = section.icon;

            return (
              <button
                key={section.id}
                type="button"
                className={`${styles.overviewFocusLink} ${
                  activeSectionId === section.id ? styles.overviewFocusLinkActive : ''
                }`}
                onClick={() => handleSectionJump(section.id)}
              >
                <span className={styles.focusIcon}>
                  <Icon size={16} />
                </span>
                <span className={styles.focusCopy}>
                  <span className={styles.focusTitle}>{section.title}</span>
                  <span className={styles.focusDescription}>{section.description}</span>
                </span>
                {section.errorCount > 0 ? (
                  <span className={styles.navBadge} aria-hidden="true">
                    {section.errorCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={workspaceRef} className={styles.workspace}>
        {isMobile ? (
          <div className={styles.mobileSectionNav}>
            <div
              ref={mobileNavScrollerRef}
              className={styles.mobileSectionNavScroller}
              aria-label={t('config_management.visual.quick_jump', { defaultValue: '快速跳转' })}
            >
              {sections.map((section, index) => (
                <button
                  key={section.id}
                  ref={(node) => {
                    mobileNavButtonRefs.current[section.id] = node;
                  }}
                  type="button"
                  className={`${styles.mobileSectionNavButton} ${
                    activeSectionId === section.id ? styles.mobileSectionNavButtonActive : ''
                  }`}
                  onClick={() => handleSectionJump(section.id)}
                >
                  <span className={styles.mobileSectionNavIndex}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className={styles.mobileSectionNavLabel}>{section.title}</span>
                  {section.errorCount > 0 ? (
                    <span className={styles.mobileSectionNavBadge} aria-hidden="true">
                      {section.errorCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <aside ref={sidebarAnchorRef} className={styles.sidebar}>
          {isFloatingSidebar ? (
            <div className={styles.sidebarPlaceholder} aria-hidden="true" />
          ) : (
            <div className={styles.sidebarRail}>{navContent}</div>
          )}
        </aside>

        <div className={styles.sections}>
          <ConfigSection
            id="server"
            ref={(node) => {
              sectionRefs.current.server = node;
            }}
            indexLabel="01"
            icon={<IconSettings size={16} />}
            title={t('config_management.visual.sections.server.title')}
            description={t('config_management.visual.sections.server.description')}
          >
            <SectionGrid>
              <Input
                label={t('config_management.visual.sections.server.host')}
                placeholder="0.0.0.0"
                value={values.host}
                onChange={(e) => onChange({ host: e.target.value })}
                disabled={disabled}
              />
              <Input
                label={t('config_management.visual.sections.server.port')}
                type="number"
                placeholder="8317"
                value={values.port}
                onChange={(e) => onChange({ port: e.target.value })}
                disabled={disabled}
                error={portError}
              />
            </SectionGrid>
          </ConfigSection>

          <ConfigSection
            id="tls"
            ref={(node) => {
              sectionRefs.current.tls = node;
            }}
            indexLabel="02"
            icon={<IconShield size={16} />}
            title={t('config_management.visual.sections.tls.title')}
            description={t('config_management.visual.sections.tls.description')}
          >
            <SectionStack>
              <ToggleRow
                title={t('config_management.visual.sections.tls.enable')}
                description={t('config_management.visual.sections.tls.enable_desc')}
                checked={values.tlsEnable}
                disabled={disabled}
                onChange={(tlsEnable) => onChange({ tlsEnable })}
              />

              {values.tlsEnable ? (
                <>
                  <Divider />
                  <SectionGrid>
                    <Input
                      label={t('config_management.visual.sections.tls.cert')}
                      placeholder="/path/to/cert.pem"
                      value={values.tlsCert}
                      onChange={(e) => onChange({ tlsCert: e.target.value })}
                      disabled={disabled}
                    />
                    <Input
                      label={t('config_management.visual.sections.tls.key')}
                      placeholder="/path/to/key.pem"
                      value={values.tlsKey}
                      onChange={(e) => onChange({ tlsKey: e.target.value })}
                      disabled={disabled}
                    />
                  </SectionGrid>
                </>
              ) : null}
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="remote"
            ref={(node) => {
              sectionRefs.current.remote = node;
            }}
            indexLabel="03"
            icon={<IconSatellite size={16} />}
            title={t('config_management.visual.sections.remote.title')}
            description={t('config_management.visual.sections.remote.description')}
          >
            <SectionStack>
              <ToggleRow
                title={t('config_management.visual.sections.remote.allow_remote')}
                description={t('config_management.visual.sections.remote.allow_remote_desc')}
                checked={values.rmAllowRemote}
                disabled={disabled}
                onChange={(rmAllowRemote) => onChange({ rmAllowRemote })}
              />
              <ToggleRow
                title={t('config_management.visual.sections.remote.disable_panel')}
                description={t('config_management.visual.sections.remote.disable_panel_desc')}
                checked={values.rmDisableControlPanel}
                disabled={disabled}
                onChange={(rmDisableControlPanel) => onChange({ rmDisableControlPanel })}
              />
              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.remote.secret_key')}
                  type="password"
                  placeholder={t('config_management.visual.sections.remote.secret_key_placeholder')}
                  value={values.rmSecretKey}
                  onChange={(e) => onChange({ rmSecretKey: e.target.value })}
                  disabled={disabled}
                />
                <Input
                  label={t('config_management.visual.sections.remote.access_path')}
                  placeholder={t(
                    'config_management.visual.sections.remote.access_path_placeholder'
                  )}
                  value={values.rmAccessPath}
                  onChange={(e) => onChange({ rmAccessPath: e.target.value })}
                  disabled={disabled}
                  hint={t('config_management.visual.sections.remote.access_path_hint')}
                  error={rmAccessPathError}
                />
                <Input
                  label={t('config_management.visual.sections.remote.panel_repo')}
                  placeholder="https://github.com/router-for-me/Cli-Proxy-API-Management-Center"
                  value={values.rmPanelRepo}
                  onChange={(e) => onChange({ rmPanelRepo: e.target.value })}
                  disabled={disabled}
                />
              </SectionGrid>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="auth"
            ref={(node) => {
              sectionRefs.current.auth = node;
            }}
            indexLabel="04"
            icon={<IconKey size={16} />}
            title={t('config_management.visual.sections.auth.title')}
            description={t('config_management.visual.sections.auth.description')}
          >
            <SectionStack>
              <Input
                label={t('config_management.visual.sections.auth.auth_dir')}
                placeholder="~/.cli-proxy-api"
                value={values.authDir}
                onChange={(e) => onChange({ authDir: e.target.value })}
                disabled={disabled}
                hint={t('config_management.visual.sections.auth.auth_dir_hint')}
              />
              <div className={styles.subsection}>
                <ApiKeysCardEditor
                  value={values.apiKeysText}
                  disabled={disabled}
                  onChange={handleApiKeysTextChange}
                />
              </div>
              <SectionSubsection
                title={t('config_management.visual.codex_custom_models.title')}
                description={t('config_management.visual.codex_custom_models.description')}
              >
                <CodexCustomModelsEditor
                  value={values.codexCustomModels}
                  validationErrors={codexCustomModelValidationErrors}
                  disabled={disabled}
                  onChange={handleCodexCustomModelsChange}
                />
              </SectionSubsection>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="system"
            ref={(node) => {
              sectionRefs.current.system = node;
            }}
            indexLabel="05"
            icon={<IconDiamond size={16} />}
            title={t('config_management.visual.sections.system.title')}
            description={t('config_management.visual.sections.system.description')}
          >
            <SectionStack>
              <SectionGrid>
                <ToggleRow
                  title={t('config_management.visual.sections.system.debug')}
                  description={t('config_management.visual.sections.system.debug_desc')}
                  checked={values.debug}
                  disabled={disabled}
                  onChange={(debug) => onChange({ debug })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.system.commercial_mode')}
                  description={t('config_management.visual.sections.system.commercial_mode_desc')}
                  checked={values.commercialMode}
                  disabled={disabled}
                  onChange={(commercialMode) => onChange({ commercialMode })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.system.logging_to_file')}
                  description={t('config_management.visual.sections.system.logging_to_file_desc')}
                  checked={values.loggingToFile}
                  disabled={disabled}
                  onChange={(loggingToFile) => onChange({ loggingToFile })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.system.usage_statistics')}
                  description={t('config_management.visual.sections.system.usage_statistics_desc')}
                  checked={values.usageStatisticsEnabled}
                  disabled={disabled}
                  onChange={(usageStatisticsEnabled) => onChange({ usageStatisticsEnabled })}
                />
              </SectionGrid>

              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.system.logs_max_size')}
                  type="number"
                  placeholder="0"
                  value={values.logsMaxTotalSizeMb}
                  onChange={(e) => onChange({ logsMaxTotalSizeMb: e.target.value })}
                  disabled={disabled}
                  error={logsMaxSizeError}
                />
                <Input
                  label={t('config_management.visual.sections.system.usage_statistics_persist')}
                  type="number"
                  placeholder="0"
                  value={values.usageStatisticsPersistIntervalSeconds}
                  onChange={(e) =>
                    onChange({ usageStatisticsPersistIntervalSeconds: e.target.value })
                  }
                  disabled={disabled}
                  hint={t('config_management.visual.sections.system.usage_statistics_persist_desc')}
                  error={usageStatisticsPersistIntervalError}
                />
              </SectionGrid>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="network"
            ref={(node) => {
              sectionRefs.current.network = node;
            }}
            indexLabel="06"
            icon={<IconTrendingUp size={16} />}
            title={t('config_management.visual.sections.network.title')}
            description={t('config_management.visual.sections.network.description')}
          >
            <SectionStack>
              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.network.proxy_url')}
                  placeholder="socks5://user:pass@127.0.0.1:1080/"
                  value={values.proxyUrl}
                  onChange={(e) => onChange({ proxyUrl: e.target.value })}
                  disabled={disabled}
                />
                <Input
                  label={t('config_management.visual.sections.network.request_retry')}
                  type="number"
                  placeholder="3"
                  value={values.requestRetry}
                  onChange={(e) => onChange({ requestRetry: e.target.value })}
                  disabled={disabled}
                  error={requestRetryError}
                />
                <Input
                  label={t('config_management.visual.sections.network.max_retry_credentials')}
                  type="number"
                  placeholder="0"
                  value={values.maxRetryCredentials}
                  onChange={(e) => onChange({ maxRetryCredentials: e.target.value })}
                  disabled={disabled}
                  hint={t('config_management.visual.sections.network.max_retry_credentials_hint')}
                  error={maxRetryCredentialsError}
                />
                <Input
                  label={t('config_management.visual.sections.network.max_retry_interval')}
                  type="number"
                  placeholder="30"
                  value={values.maxRetryInterval}
                  onChange={(e) => onChange({ maxRetryInterval: e.target.value })}
                  disabled={disabled}
                  error={maxRetryIntervalError}
                />
                <FieldShell
                  label={t('config_management.visual.sections.network.routing_strategy')}
                  labelId={routingStrategyLabelId}
                  hint={t('config_management.visual.sections.network.routing_strategy_hint')}
                  hintId={routingStrategyHintId}
                >
                  <Select
                    value={values.routingStrategy}
                    options={[
                      {
                        value: 'round-robin',
                        label: t('config_management.visual.sections.network.strategy_round_robin'),
                      },
                      {
                        value: 'fill-first',
                        label: t('config_management.visual.sections.network.strategy_fill_first'),
                      },
                      {
                        value: 'random',
                        label: t('config_management.visual.sections.network.strategy_random'),
                      },
                    ]}
                    id={`${routingStrategyLabelId}-select`}
                    disabled={disabled}
                    ariaLabelledBy={routingStrategyLabelId}
                    ariaDescribedBy={routingStrategyHintId}
                    onChange={(nextValue) =>
                      onChange({
                        routingStrategy: nextValue as VisualConfigValues['routingStrategy'],
                      })
                    }
                  />
                </FieldShell>
                <Input
                  label={t('config_management.visual.sections.network.session_affinity_ttl')}
                  placeholder="1h"
                  value={values.routingSessionAffinityTTL}
                  onChange={(e) => onChange({ routingSessionAffinityTTL: e.target.value })}
                  disabled={disabled}
                />
              </SectionGrid>

              <SectionGrid>
                <ToggleRow
                  title={t('config_management.visual.sections.network.enable_gemini_cli_endpoint')}
                  description={t(
                    'config_management.visual.sections.network.enable_gemini_cli_endpoint_desc'
                  )}
                  checked={values.enableGeminiCliEndpoint}
                  disabled={disabled}
                  onChange={(enableGeminiCliEndpoint) => onChange({ enableGeminiCliEndpoint })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.force_model_prefix')}
                  description={t(
                    'config_management.visual.sections.network.force_model_prefix_desc'
                  )}
                  checked={values.forceModelPrefix}
                  disabled={disabled}
                  onChange={(forceModelPrefix) => onChange({ forceModelPrefix })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.session_affinity')}
                  checked={values.routingSessionAffinity}
                  disabled={disabled}
                  onChange={(routingSessionAffinity) => onChange({ routingSessionAffinity })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.network.ws_auth')}
                  description={t('config_management.visual.sections.network.ws_auth_desc')}
                  checked={values.wsAuth}
                  disabled={disabled}
                  onChange={(wsAuth) => onChange({ wsAuth })}
                />
              </SectionGrid>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="images"
            ref={(node) => {
              sectionRefs.current.images = node;
            }}
            indexLabel="07"
            icon={<IconDiamond size={16} />}
            title={t('config_management.visual.sections.images.title')}
            description={t('config_management.visual.sections.images.description')}
          >
            <SectionStack>
              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.images.codex_model')}
                  placeholder="gpt-5.4"
                  value={values.images.codexModel}
                  onChange={(e) =>
                    onChange({
                      images: {
                        ...values.images,
                        codexModel: e.target.value,
                      },
                    })
                  }
                  disabled={disabled}
                  hint={t('config_management.visual.sections.images.codex_model_hint')}
                />
                <Input
                  label={t('config_management.visual.sections.images.image_model')}
                  placeholder="gpt-image-2"
                  value={values.images.imageModel}
                  onChange={(e) =>
                    onChange({
                      images: {
                        ...values.images,
                        imageModel: e.target.value,
                      },
                    })
                  }
                  disabled={disabled}
                  hint={t('config_management.visual.sections.images.image_model_hint')}
                />
                <Input
                  label={t('config_management.visual.sections.images.unsupported_status_code')}
                  type="number"
                  placeholder="400"
                  value={values.images.unsupportedStatusCode}
                  onChange={(e) =>
                    onChange({
                      images: {
                        ...values.images,
                        unsupportedStatusCode: e.target.value,
                      },
                    })
                  }
                  disabled={disabled}
                  hint={t('config_management.visual.sections.images.unsupported_status_code_hint')}
                  error={imagesUnsupportedStatusCodeError}
                />
              </SectionGrid>

              <SectionGrid>
                <ToggleRow
                  title={t(
                    'config_management.visual.sections.images.enable_free_plan_image_model'
                  )}
                  description={t(
                    'config_management.visual.sections.images.enable_free_plan_image_model_desc'
                  )}
                  checked={values.images.enableFreePlanImageModel}
                  disabled={disabled}
                  onChange={(enableFreePlanImageModel) =>
                    onChange({
                      images: {
                        ...values.images,
                        enableFreePlanImageModel,
                      },
                    })
                  }
                />
                <ToggleRow
                  title={t('config_management.visual.sections.images.enable_n_aggregation')}
                  description={t(
                    'config_management.visual.sections.images.enable_n_aggregation_desc'
                  )}
                  checked={values.images.enableNAggregation}
                  disabled={disabled}
                  onChange={(enableNAggregation) =>
                    onChange({
                      images: {
                        ...values.images,
                        enableNAggregation,
                      },
                    })
                  }
                />
                <ToggleRow
                  title={t('config_management.visual.sections.images.override_response_format_url')}
                  description={t(
                    'config_management.visual.sections.images.override_response_format_url_desc'
                  )}
                  checked={values.images.overrideResponseFormatUrl}
                  disabled={disabled}
                  onChange={(overrideResponseFormatUrl) =>
                    onChange({
                      images: {
                        ...values.images,
                        overrideResponseFormatUrl,
                      },
                    })
                  }
                />
                <ToggleRow
                  title={t('config_management.visual.sections.images.response_format_url_data_url')}
                  description={t(
                    'config_management.visual.sections.images.response_format_url_data_url_desc'
                  )}
                  checked={values.images.responseFormatUrlDataUrl}
                  disabled={disabled}
                  onChange={(responseFormatUrlDataUrl) =>
                    onChange({
                      images: {
                        ...values.images,
                        responseFormatUrlDataUrl,
                      },
                    })
                  }
                />
                <ToggleRow
                  title={t(
                    'config_management.visual.sections.images.override_transparent_background'
                  )}
                  description={t(
                    'config_management.visual.sections.images.override_transparent_background_desc'
                  )}
                  checked={values.images.overrideTransparentBackground}
                  disabled={disabled}
                  onChange={(overrideTransparentBackground) =>
                    onChange({
                      images: {
                        ...values.images,
                        overrideTransparentBackground,
                      },
                    })
                  }
                />
                <ToggleRow
                  title={t('config_management.visual.sections.images.override_input_fidelity')}
                  description={t(
                    'config_management.visual.sections.images.override_input_fidelity_desc'
                  )}
                  checked={values.images.overrideInputFidelity}
                  disabled={disabled}
                  onChange={(overrideInputFidelity) =>
                    onChange({
                      images: {
                        ...values.images,
                        overrideInputFidelity,
                      },
                    })
                  }
                />
              </SectionGrid>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="quota"
            ref={(node) => {
              sectionRefs.current.quota = node;
            }}
            indexLabel="08"
            icon={<IconTimer size={16} />}
            title={t('config_management.visual.sections.quota.title')}
            description={t('config_management.visual.sections.quota.description')}
          >
            <SectionStack>
              <SectionGrid>
                <ToggleRow
                  title={t('config_management.visual.sections.quota.switch_project')}
                  description={t('config_management.visual.sections.quota.switch_project_desc')}
                  checked={values.quotaSwitchProject}
                  disabled={disabled}
                  onChange={(quotaSwitchProject) => onChange({ quotaSwitchProject })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.quota.switch_preview_model')}
                  description={t('config_management.visual.sections.quota.switch_preview_model_desc')}
                  checked={values.quotaSwitchPreviewModel}
                  disabled={disabled}
                  onChange={(quotaSwitchPreviewModel) => onChange({ quotaSwitchPreviewModel })}
                />
                <ToggleRow
                  title={t('config_management.visual.sections.quota.antigravity_credits')}
                  description={t('config_management.visual.sections.quota.antigravity_credits_desc')}
                  checked={values.quotaAntigravityCredits}
                  disabled={disabled}
                  onChange={(quotaAntigravityCredits) => onChange({ quotaAntigravityCredits })}
                />
              </SectionGrid>
              <FieldShell
                label={t('config_management.visual.sections.quota.no_cooldown_status_codes')}
                htmlFor={noCooldownStatusCodesInputId}
                hint={t('config_management.visual.sections.quota.no_cooldown_status_codes_desc')}
                hintId={noCooldownStatusCodesHintId}
                error={noCooldownStatusCodesError}
                errorId={noCooldownStatusCodesErrorId}
              >
                <div className={styles.fieldControl}>
                  <textarea
                    id={noCooldownStatusCodesInputId}
                    className={`input ${styles.fieldTextarea}`}
                    placeholder="404, 409"
                    value={values.noCooldownStatusCodes}
                    onChange={(e) => onChange({ noCooldownStatusCodes: e.target.value })}
                    disabled={disabled}
                    rows={3}
                    aria-invalid={Boolean(noCooldownStatusCodesError)}
                    aria-describedby={`${noCooldownStatusCodesHintId} ${noCooldownStatusCodesError ? noCooldownStatusCodesErrorId : ''}`.trim()}
                  />
                </div>
              </FieldShell>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="maintenance"
            ref={(node) => {
              sectionRefs.current.maintenance = node;
            }}
            indexLabel="09"
            icon={<IconShield size={16} />}
            title={t('config_management.visual.sections.maintenance.title')}
            description={t('config_management.visual.sections.maintenance.description')}
          >
            <SectionStack>
              <SectionGrid>
                <ToggleRow
                  title={t('config_management.visual.sections.maintenance.enable')}
                  description={t('config_management.visual.sections.maintenance.enable_desc')}
                  checked={values.authMaintenance.enable}
                  disabled={disabled}
                  onChange={(enable) =>
                    onChange({
                      authMaintenance: {
                        ...values.authMaintenance,
                        enable,
                      },
                    })
                  }
                />
                <ToggleRow
                  title={t('config_management.visual.sections.maintenance.delete_quota_exceeded')}
                  description={t(
                    'config_management.visual.sections.maintenance.delete_quota_exceeded_desc'
                  )}
                  checked={values.authMaintenance.deleteQuotaExceeded}
                  disabled={disabled}
                  onChange={(deleteQuotaExceeded) =>
                    onChange({
                      authMaintenance: {
                        ...values.authMaintenance,
                        deleteQuotaExceeded,
                      },
                    })
                  }
                />
                <ToggleRow
                  title={t('config_management.visual.sections.maintenance.disable_quota_exceeded')}
                  description={t(
                    'config_management.visual.sections.maintenance.disable_quota_exceeded_desc'
                  )}
                  checked={values.authMaintenance.disableQuotaExceeded}
                  disabled={disabled}
                  onChange={(disableQuotaExceeded) =>
                    onChange({
                      authMaintenance: {
                        ...values.authMaintenance,
                        disableQuotaExceeded,
                      },
                    })
                  }
                />
              </SectionGrid>

              <SectionGrid>
                <Input
                  label={t('config_management.visual.sections.maintenance.scan_interval_seconds')}
                  type="number"
                  placeholder="30"
                  value={values.authMaintenance.scanIntervalSeconds}
                  onChange={(e) =>
                    onChange({
                      authMaintenance: {
                        ...values.authMaintenance,
                        scanIntervalSeconds: e.target.value,
                      },
                    })
                  }
                  disabled={disabled}
                  error={authMaintenanceScanIntervalError}
                />
                <Input
                  label={t('config_management.visual.sections.maintenance.delete_interval_seconds')}
                  type="number"
                  placeholder="5"
                  value={values.authMaintenance.deleteIntervalSeconds}
                  onChange={(e) =>
                    onChange({
                      authMaintenance: {
                        ...values.authMaintenance,
                        deleteIntervalSeconds: e.target.value,
                      },
                    })
                  }
                  disabled={disabled}
                  error={authMaintenanceDeleteIntervalError}
                />
                <Input
                  label={t('config_management.visual.sections.maintenance.quota_strike_threshold')}
                  type="number"
                  placeholder="6"
                  value={values.authMaintenance.quotaStrikeThreshold}
                  onChange={(e) =>
                    onChange({
                      authMaintenance: {
                        ...values.authMaintenance,
                        quotaStrikeThreshold: e.target.value,
                      },
                    })
                  }
                  disabled={disabled}
                  error={authMaintenanceQuotaStrikeThresholdError}
                />
                <Input
                  label={t(
                    'config_management.visual.sections.maintenance.disable_quota_strike_threshold'
                  )}
                  type="number"
                  placeholder="6"
                  value={values.authMaintenance.disableQuotaStrikeThreshold}
                  onChange={(e) =>
                    onChange({
                      authMaintenance: {
                        ...values.authMaintenance,
                        disableQuotaStrikeThreshold: e.target.value,
                      },
                    })
                  }
                  disabled={disabled}
                  error={authMaintenanceDisableQuotaStrikeThresholdError}
                />
              </SectionGrid>

              <FieldShell
                label={t('config_management.visual.sections.maintenance.delete_status_codes')}
                htmlFor={maintenanceDeleteStatusCodesInputId}
                hint={t('config_management.visual.sections.maintenance.delete_status_codes_desc')}
                hintId={maintenanceDeleteStatusCodesHintId}
                error={authMaintenanceDeleteStatusCodesError}
                errorId={maintenanceDeleteStatusCodesErrorId}
              >
                <div className={styles.fieldControl}>
                  <textarea
                    id={maintenanceDeleteStatusCodesInputId}
                    className={`input ${styles.fieldTextarea}`}
                    placeholder="401, 403"
                    value={values.authMaintenance.deleteStatusCodes}
                    onChange={(e) =>
                      onChange({
                        authMaintenance: {
                          ...values.authMaintenance,
                          deleteStatusCodes: e.target.value,
                        },
                      })
                    }
                    disabled={disabled}
                    rows={3}
                    aria-invalid={Boolean(authMaintenanceDeleteStatusCodesError)}
                    aria-describedby={`${maintenanceDeleteStatusCodesHintId} ${authMaintenanceDeleteStatusCodesError ? maintenanceDeleteStatusCodesErrorId : ''}`.trim()}
                  />
                </div>
              </FieldShell>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="streaming"
            ref={(node) => {
              sectionRefs.current.streaming = node;
            }}
            indexLabel="10"
            icon={<IconSatellite size={16} />}
            title={t('config_management.visual.sections.streaming.title')}
            description={t('config_management.visual.sections.streaming.description')}
          >
            <SectionStack>
              <SectionGrid>
                <FieldShell
                  label={t('config_management.visual.sections.streaming.keepalive_seconds')}
                  htmlFor={keepaliveInputId}
                  hint={t('config_management.visual.sections.streaming.keepalive_hint')}
                  hintId={keepaliveHintId}
                  error={keepaliveError}
                  errorId={keepaliveErrorId}
                >
                  <div className={styles.fieldControl}>
                    <input
                      id={keepaliveInputId}
                      className="input"
                      type="number"
                      placeholder="0"
                      value={values.streaming.keepaliveSeconds}
                      onChange={(e) =>
                        onChange({
                          streaming: {
                            ...values.streaming,
                            keepaliveSeconds: e.target.value,
                          },
                        })
                      }
                      disabled={disabled}
                    />
                    {isKeepaliveDisabled ? (
                      <span className={styles.inlinePill}>
                        {t('config_management.visual.sections.streaming.disabled')}
                      </span>
                    ) : null}
                  </div>
                </FieldShell>

                <Input
                  label={t('config_management.visual.sections.streaming.bootstrap_retries')}
                  type="number"
                  placeholder="1"
                  value={values.streaming.bootstrapRetries}
                  onChange={(e) =>
                    onChange({
                      streaming: {
                        ...values.streaming,
                        bootstrapRetries: e.target.value,
                      },
                    })
                  }
                  disabled={disabled}
                  hint={t('config_management.visual.sections.streaming.bootstrap_hint')}
                  error={bootstrapRetriesError}
                />
              </SectionGrid>

              <SectionGrid>
                <FieldShell
                  label={t('config_management.visual.sections.streaming.nonstream_keepalive')}
                  htmlFor={nonstreamKeepaliveInputId}
                  hint={t('config_management.visual.sections.streaming.nonstream_keepalive_hint')}
                  hintId={nonstreamKeepaliveHintId}
                  error={nonstreamKeepaliveError}
                  errorId={nonstreamKeepaliveErrorId}
                >
                  <div className={styles.fieldControl}>
                    <input
                      id={nonstreamKeepaliveInputId}
                      className="input"
                      type="number"
                      placeholder="0"
                      value={values.streaming.nonstreamKeepaliveInterval}
                      onChange={(e) =>
                        onChange({
                          streaming: {
                            ...values.streaming,
                            nonstreamKeepaliveInterval: e.target.value,
                          },
                        })
                      }
                      disabled={disabled}
                    />
                    {isNonstreamKeepaliveDisabled ? (
                      <span className={styles.inlinePill}>
                        {t('config_management.visual.sections.streaming.disabled')}
                      </span>
                    ) : null}
                  </div>
                </FieldShell>
              </SectionGrid>
            </SectionStack>
          </ConfigSection>

          <ConfigSection
            id="payload"
            ref={(node) => {
              sectionRefs.current.payload = node;
            }}
            indexLabel="11"
            icon={<IconCode size={16} />}
            title={t('config_management.visual.sections.payload.title')}
            description={t('config_management.visual.sections.payload.description')}
          >
            <SectionStack>
              <SectionSubsection
                title={t('config_management.visual.sections.payload.default_rules')}
                description={t('config_management.visual.sections.payload.default_rules_desc')}
              >
                <PayloadRulesEditor
                  value={values.payloadDefaultRules}
                  disabled={disabled}
                  onChange={handlePayloadDefaultRulesChange}
                />
              </SectionSubsection>

              <SectionSubsection
                title={t('config_management.visual.sections.payload.default_raw_rules')}
                description={t('config_management.visual.sections.payload.default_raw_rules_desc')}
              >
                <PayloadRulesEditor
                  value={values.payloadDefaultRawRules}
                  disabled={disabled}
                  rawJsonValues
                  onChange={handlePayloadDefaultRawRulesChange}
                />
              </SectionSubsection>

              <SectionSubsection
                title={t('config_management.visual.sections.payload.override_rules')}
                description={t('config_management.visual.sections.payload.override_rules_desc')}
              >
                <PayloadRulesEditor
                  value={values.payloadOverrideRules}
                  disabled={disabled}
                  protocolFirst
                  onChange={handlePayloadOverrideRulesChange}
                />
              </SectionSubsection>

              <SectionSubsection
                title={t('config_management.visual.sections.payload.override_raw_rules')}
                description={t('config_management.visual.sections.payload.override_raw_rules_desc')}
              >
                <PayloadRulesEditor
                  value={values.payloadOverrideRawRules}
                  disabled={disabled}
                  protocolFirst
                  rawJsonValues
                  onChange={handlePayloadOverrideRawRulesChange}
                />
              </SectionSubsection>

              <SectionSubsection
                title={t('config_management.visual.sections.payload.filter_rules')}
                description={t('config_management.visual.sections.payload.filter_rules_desc')}
              >
                <PayloadFilterRulesEditor
                  value={values.payloadFilterRules}
                  disabled={disabled}
                  onChange={handlePayloadFilterRulesChange}
                />
              </SectionSubsection>
            </SectionStack>
          </ConfigSection>
        </div>
      </div>

      {shouldRenderFloatingSidebar && typeof document !== 'undefined'
        ? createPortal(
            <div ref={floatingSidebarRef} className={styles.floatingSidebarContainer}>
              <div className={styles.floatingSidebarRail}>{navContent}</div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
