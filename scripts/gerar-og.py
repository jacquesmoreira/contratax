# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw, ImageFont
W, H = 1200, 630
img = Image.new("RGB", (W, H), (255, 255, 255))
d = ImageDraw.Draw(img)

def font(sz, bold=True):
    p = r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf"
    return ImageFont.truetype(p, sz)

def center(text, y, f, fill):
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill)

logo = Image.open(r"D:\Licita\web\public\logo-horizontal.png").convert("RGB")
lw = 660
lh = int(logo.height * lw / logo.width)
logo = logo.resize((lw, lh))
img.paste(logo, ((W - lw) // 2, 70))

navy = (15, 30, 70)
cinza = (90, 105, 130)
center("Encontre e ganhe as licitações do seu ramo", 300, font(46), navy)
center("Monitoramento de editais do PNCP, todo dia,", 372, font(30, False), cinza)
center("e a conferência que diz se você está apto.", 412, font(30, False), cinza)

d.rectangle([0, 540, W, H], fill=navy)
center("contratax.com.br   ·   Dados oficiais do PNCP", 568, font(28), (255, 255, 255))

img.save(r"D:\Licita\web\public\og-image.png")
print("og-image regenerada com acentos:", img.size)
