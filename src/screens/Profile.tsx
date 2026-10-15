import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation'
import { useState } from 'react'
import { api } from '../api/endpoints'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { SideMenu } from '../components/SideMenu'
import { log } from '../lib/log'
import { useSettings, settings, type Settings } from '../lib/settings'

type Option<K extends keyof Settings> = { value: Settings[K]; label: string }

export function Profile({ active }: { active: boolean }) {
  const s = useSettings()
  const [confirmClear, setConfirmClear] = useState(false)

  const clearData = () => {
    api
      .logout()
      .then(() => {
        log('clear_data', true, 'success')
        location.reload()
      })
      .catch((e) => log('clear_data', false, e))
  }

  return (
    <Screen id="profile" active={active} initialFocus="settings-subLang">
      <div className="page has-rail">
        <SideMenu current="profile" />
        <div className="scroll-page">
          <div className="page-head">
            <h1>تنظیمات برنامه</h1>
          </div>

          <div className="account">
            <div>
              <div className="account-name">سرویس محتوای CCloud</div>
              <div className="meta">
                <span>دسترسی مستقیم و رایگان</span>
                <span>بدون نیاز به ورود یا اشتراک</span>
              </div>
            </div>
          </div>

          <SettingRow<'quality'>
            name="quality"
            title="کیفیت تصویر پیش‌فرض"
            value={s.quality}
            options={[
              { value: 0, label: 'خودکار (بالاترین کیفیت)' },
              { value: 1080, label: '1080p' },
              { value: 720, label: '720p' },
              { value: 480, label: '480p' },
            ]}
          />

          <SettingRow<'subLang'>
            name="subLang"
            title="زیرنویس پیش‌فرض"
            value={s.subLang}
            options={[
              { value: 'fa', label: 'فارسی (چسبیده / داخلی)' },
              { value: 'en', label: 'انگلیسی' },
              { value: 'off', label: 'خاموش' },
            ]}
          />

          <SettingRow<'subSize'>
            name="subSize"
            title="اندازه متن زیرنویس"
            value={s.subSize}
            options={[
              { value: 's', label: 'کوچک' },
              { value: 'm', label: 'متوسط' },
              { value: 'l', label: 'بزرگ' },
            ]}
          />

          <SettingRow<'audio'>
            name="audio"
            title="صدای پیش‌فرض"
            value={s.audio}
            options={[
              { value: '2', label: 'استریو (۲ کاناله)' },
              { value: '6', label: 'فراگیر ۵.۱ (۶ کاناله)' },
            ]}
          />

          <div className="actions">
            <Button onPress={() => setConfirmClear(true)}>پاک کردن تاریخچه و داده‌های محلی</Button>
          </div>
        </div>

        {confirmClear && (
          <Sheet
            id="clear-sheet"
            title="آیا می‌خواهید تاریخچه تماشا و داده‌های ذخیره‌شده محلی پاک شوند؟"
            onClose={() => setConfirmClear(false)}
            actions={[
              { label: 'انصراف', onPress: () => undefined },
              { label: 'پاک کردن داده‌ها', variant: 'primary', onPress: clearData },
            ]}
          />
        )}
      </div>
    </Screen>
  )
}

function SettingRow<K extends keyof Settings>({
  name,
  title,
  value,
  options,
}: {
  name: K
  title: string
  value: Settings[K]
  options: Option<K>[]
}) {
  const { ref, focusKey } = useFocusable({ focusKey: `settings-${name}`, saveLastFocusedChild: true })
  return (
    <FocusContext.Provider value={focusKey}>
      <section ref={ref} className="setting-row">
        <h2>{title}</h2>
        <div className="chips wrap">
          {options.map((opt) => (
            <Button
              key={String(opt.value)}
              className={opt.value === value ? 'selected' : ''}
              onPress={() => settings.set({ [name]: opt.value } as Partial<Settings>)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </section>
    </FocusContext.Provider>
  )
}
